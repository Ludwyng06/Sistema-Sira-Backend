import { Injectable } from '@nestjs/common';
import { RRule } from 'rrule';
import { OrigenFranja, Rol } from '../../../generated/prisma/enums.js';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ErrorDominio, noEncontrado } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { AnularBloqueoDto, BloqueoAnuladoDto } from '../dto/anular-bloqueo.dto.js';
import type { CrearBloqueoDto } from '../dto/crear-bloqueo.dto.js';
import type { BloqueoCreadoDto } from '../dto/respuestas.js';

export const MAXIMO_OCURRENCIAS = 366;
const MS_POR_DIA = 86_400_000;
const CODIGO_EXCLUSION = '23P01';

export interface ContextoAuditoria {
  ip: string | null;
  userAgent: string | null;
  correlacionId: string | null;
}

interface Ocurrencia {
  inicio: Date;
  fin: Date;
}

function datosInvalidos(mensaje: string): ErrorDominio {
  return new ErrorDominio('BLOQUEO_INVALIDO', mensaje, 400);
}

function conflicto(conflictos: Ocurrencia[]): ErrorDominio {
  return new ErrorDominio(
    'FRANJA_NO_DISPONIBLE',
    'El espacio ya tiene ocupación en alguna de las franjas del bloqueo. Revisa los conflictos.',
    409,
    {
      conflictos: conflictos.map((c) => ({ inicio: c.inicio.toISOString(), fin: c.fin.toISOString() })),
    },
  );
}

function esViolacionDeExclusion(error: unknown): boolean {
  const texto = JSON.stringify(error, Object.getOwnPropertyNames(error ?? {}));
  return texto.includes(CODIGO_EXCLUSION) || texto.includes('sin_solapamiento');
}

/**
 * Bogotá no tiene horario de verano: su desfase con UTC es fijo. Se expande la regla sobre la hora local
 * (corrida 5 h) para que BYDAY, BYMONTHDAY, etc. se evalúen en el día de Bogotá y no en el de UTC.
 */
const DESFASE_BOGOTA_MS = 5 * 3_600_000;

/** Expande el bloqueo en ocurrencias [inicio, fin). Sin RRULE devuelve una sola. */
export function expandirOcurrencias(datos: {
  inicio: Date;
  fin: Date;
  rrule?: string;
  repetirHasta?: Date;
}): Ocurrencia[] {
  if (!datos.rrule) return [{ inicio: datos.inicio, fin: datos.fin }];
  if (!datos.repetirHasta) throw datosInvalidos('Indica hasta cuándo se repite el bloqueo (repetirHasta).');
  if (Number.isNaN(datos.repetirHasta.getTime())) throw datosInvalidos('repetirHasta no es una fecha válida.');
  if (datos.repetirHasta < datos.inicio) {
    throw datosInvalidos('repetirHasta no puede ser anterior al inicio del bloqueo.');
  }

  let regla: RRule;
  try {
    const opciones = RRule.parseString(datos.rrule.replace(/^RRULE:/i, ''));
    regla = new RRule({
      ...opciones,
      dtstart: new Date(datos.inicio.getTime() - DESFASE_BOGOTA_MS),
      until: new Date(datos.repetirHasta.getTime() - DESFASE_BOGOTA_MS),
    });
  } catch {
    throw datosInvalidos('La regla de repetición (rrule) no es válida.');
  }

  // Se corta al pasar el máximo: una regla como FREQ=SECONDLY no debe generar millones de fechas.
  const locales = regla.all((_fecha, i) => i <= MAXIMO_OCURRENCIAS);
  if (locales.length === 0) throw datosInvalidos('La regla de repetición no genera ninguna ocurrencia.');
  if (locales.length > MAXIMO_OCURRENCIAS) {
    throw datosInvalidos(`El bloqueo no puede generar más de ${MAXIMO_OCURRENCIAS} ocurrencias.`);
  }

  const duracion = datos.fin.getTime() - datos.inicio.getTime();
  const ocurrencias = locales.map((local) => {
    const inicio = new Date(local.getTime() + DESFASE_BOGOTA_MS);
    return { inicio, fin: new Date(inicio.getTime() + duracion) };
  });
  for (let i = 1; i < ocurrencias.length; i += 1) {
    if (ocurrencias[i]!.inicio < ocurrencias[i - 1]!.fin) {
      throw datosInvalidos('Las repeticiones se cruzan entre sí: la regla repite antes de que termine la anterior.');
    }
  }
  return ocurrencias;
}

@Injectable()
export class BloqueosService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(
    datos: CrearBloqueoDto,
    usuario: UsuarioAutenticado,
    contexto: ContextoAuditoria,
  ): Promise<BloqueoCreadoDto> {
    if (datos.motivo === OrigenFranja.RESERVA) {
      throw datosInvalidos('El motivo RESERVA no es válido para un bloqueo.');
    }
    const inicio = new Date(datos.inicio);
    const fin = new Date(datos.fin);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
      throw datosInvalidos('El inicio y el fin del bloqueo deben ser fechas válidas.');
    }
    if (fin <= inicio) throw datosInvalidos('El fin del bloqueo debe ser posterior al inicio.');
    if (fin.getTime() - inicio.getTime() > MS_POR_DIA) {
      throw datosInvalidos('Cada ocurrencia del bloqueo no puede durar más de 24 horas.');
    }

    const espacio = await this.prisma.espacio.findFirst({
      where: { id: datos.espacioId, archivadoEn: null },
      select: { id: true, dependenciaId: true, responsableId: true },
    });
    if (!espacio || !this.puedeBloquear(usuario, espacio)) throw noEncontrado('El espacio');

    const ocurrencias = expandirOcurrencias({
      inicio,
      fin,
      rrule: datos.rrule,
      repetirHasta: datos.repetirHasta ? new Date(datos.repetirHasta) : undefined,
    });

    const choques = await this.prisma.franjaOcupada.findMany({
      where: {
        espacioId: espacio.id,
        estado: { not: 'LIBERADA' },
        OR: ocurrencias.map((o) => ({ inicio: { lt: o.fin }, fin: { gt: o.inicio } })),
      },
      select: { inicio: true, fin: true },
      orderBy: { inicio: 'asc' },
    });
    if (choques.length > 0) throw conflicto(choques);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const bloqueo = await tx.bloqueoCalendario.create({
          data: {
            espacioId: espacio.id,
            motivo: datos.motivo,
            descripcion: datos.descripcion ?? null,
            inicio,
            fin,
            rrule: datos.rrule ?? null,
            repetirHasta: datos.repetirHasta ? new Date(datos.repetirHasta) : null,
            origen: 'MANUAL',
            creadoPorId: usuario.id,
          },
          select: { id: true },
        });
        await tx.franjaOcupada.createMany({
          data: ocurrencias.map((o) => ({
            espacioId: espacio.id,
            inicio: o.inicio,
            fin: o.fin,
            estado: 'BLOQUEO' as const,
            origen: datos.motivo,
            bloqueoId: bloqueo.id,
            etiquetaPublica: datos.etiquetaPublica ?? null,
          })),
        });
        await tx.bitacora.create({
          data: {
            usuarioId: usuario.id,
            accion: 'BLOQUEO_CREADO',
            entidad: 'BloqueoCalendario',
            entidadId: bloqueo.id,
            ip: contexto.ip,
            userAgent: contexto.userAgent,
            correlacionId: contexto.correlacionId,
            datosDespues: {
              espacioId: espacio.id,
              motivo: datos.motivo,
              franjas: ocurrencias.length,
              rrule: datos.rrule ?? null,
            },
          },
        });
        return {
          id: bloqueo.id,
          espacioId: espacio.id,
          motivo: datos.motivo,
          franjasCreadas: ocurrencias.length,
          inicio: ocurrencias[0]!.inicio.toISOString(),
          fin: ocurrencias[ocurrencias.length - 1]!.fin.toISOString(),
        };
      });
    } catch (error) {
      if (esViolacionDeExclusion(error)) throw conflicto([]);
      throw error;
    }
  }

  /**
   * Anula el bloqueo completo: marca `anuladoEn` y libera las franjas que todavía no terminaron. Las que
   * ya ocurrieron quedan como histórico. Mismo alcance que crear (el espacio ajeno responde 404).
   */
  async anular(
    id: string,
    datos: AnularBloqueoDto,
    usuario: UsuarioAutenticado,
    contexto: ContextoAuditoria,
  ): Promise<BloqueoAnuladoDto> {
    const bloqueo = await this.prisma.bloqueoCalendario.findUnique({
      where: { id },
      select: {
        id: true,
        anuladoEn: true,
        espacioId: true,
        espacio: { select: { dependenciaId: true, responsableId: true } },
      },
    });
    if (!bloqueo || !this.puedeBloquear(usuario, bloqueo.espacio)) throw noEncontrado('El bloqueo');
    if (bloqueo.anuladoEn) {
      throw new ErrorDominio('BLOQUEO_YA_ANULADO', 'Este bloqueo ya fue anulado.', 409);
    }

    const ahora = new Date();
    const motivo = datos.motivo.trim();
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.bloqueoCalendario.updateMany({
        where: { id, anuladoEn: null },
        data: { anuladoEn: ahora },
      });
      if (count === 0) {
        throw new ErrorDominio('BLOQUEO_YA_ANULADO', 'Este bloqueo ya fue anulado.', 409);
      }
      const { count: franjasLiberadas } = await tx.franjaOcupada.updateMany({
        where: { bloqueoId: id, estado: 'BLOQUEO', fin: { gt: ahora } },
        data: { estado: 'LIBERADA' },
      });
      await tx.bitacora.create({
        data: {
          usuarioId: usuario.id,
          accion: 'BLOQUEO_ANULADO',
          entidad: 'BloqueoCalendario',
          entidadId: id,
          ip: contexto.ip,
          userAgent: contexto.userAgent,
          correlacionId: contexto.correlacionId,
          datosDespues: { espacioId: bloqueo.espacioId, motivo, franjasLiberadas },
        },
      });
      return { id, franjasLiberadas, anuladoEn: ahora.toISOString() };
    });
  }

  private puedeBloquear(
    usuario: UsuarioAutenticado,
    espacio: { dependenciaId: string | null; responsableId: string | null },
  ): boolean {
    if (usuario.roles.includes(Rol.ADMINISTRADOR)) return true;
    if (!usuario.roles.includes(Rol.RESPONSABLE_ESPACIO)) return false;
    return (
      espacio.responsableId === usuario.id ||
      (espacio.dependenciaId !== null && usuario.dependencias.includes(espacio.dependenciaId))
    );
  }
}
