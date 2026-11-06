import { Injectable, Logger } from '@nestjs/common';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { leerCsv } from '../dominio/csv.js';
import type { ConflictoImportacionDto, ErrorFilaDto, ReporteImportacionDto } from '../dto/importacion.dto.js';
import type { ContextoAuditoria } from './bloqueos.service.js';

export const TAMANO_MAXIMO_CSV = 2 * 1024 * 1024;
export const MAXIMO_FILAS = 2000;
const MAXIMO_DIAS_POR_FILA = 400;
const MS_DIA = 86_400_000;
const DESFASE_BOGOTA = '-05:00';
const CODIGO_EXCLUSION = '23P01';

const COLUMNAS = ['espacio', 'dia', 'horainicio', 'horafin', 'desde', 'hasta'] as const;
const DIAS: Record<string, { numero: number; rrule: string }> = {
  LUN: { numero: 1, rrule: 'MO' },
  MAR: { numero: 2, rrule: 'TU' },
  MIE: { numero: 3, rrule: 'WE' },
  JUE: { numero: 4, rrule: 'TH' },
  VIE: { numero: 5, rrule: 'FR' },
  SAB: { numero: 6, rrule: 'SA' },
  DOM: { numero: 0, rrule: 'SU' },
};
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const FORMATO_HORA = /^([01]?\d|2[0-3]):[0-5]\d$/;

interface Ocurrencia {
  inicio: Date;
  fin: Date;
}

function normalizarDia(texto: string): { numero: number; rrule: string } | null {
  const sinTildes = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .slice(0, 3);
  return DIAS[sinTildes] ?? null;
}

function normalizarEncabezado(texto: string): string {
  return texto.replace(/[\s_-]/g, '');
}

const MAXIMO_DESCRIPCION = 300;

/** Excel en español guarda en Windows-1252 si no se elige UTF-8: se decodifica así para no perder las tildes. */
export function decodificarCsv(contenido: Buffer): string {
  const utf8 = contenido.toString('utf8');
  return utf8.includes('\uFFFD') ? contenido.toString('latin1') : utf8;
}

/** Quita caracteres de control (un NUL rompe la inserción en PostgreSQL) y acota el largo. */
export function limpiarDescripcion(texto: string): string | null {
  const limpio = [...texto]
    .filter((c) => {
      const codigo = c.codePointAt(0) ?? 0;
      return codigo > 0x1f && codigo !== 0x7f;
    })
    .join('')
    .trim()
    .slice(0, MAXIMO_DESCRIPCION);
  return limpio === '' ? null : limpio;
}

/** Una fecha AAAA-MM-DD real: 2026-02-31 no se acepta (Date.parse la corre al 3 de marzo). */
export function fechaReal(texto: string): number | null {
  const ms = Date.parse(`${texto}T12:00:00Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== texto) return null;
  return ms;
}

function esViolacionDeExclusion(error: unknown): boolean {
  const texto = JSON.stringify(error, Object.getOwnPropertyNames(error ?? {}));
  return texto.includes(CODIGO_EXCLUSION) || texto.includes('sin_solapamiento');
}

function describirOcupacion(franja: { estado: string; origen: string }): string {
  if (franja.origen === 'RESERVA') {
    return franja.estado === 'CONFIRMADA'
      ? 'Choca con una reserva confirmada.'
      : 'Choca con una solicitud en trámite.';
  }
  return 'Choca con otro bloqueo del calendario.';
}

@Injectable()
export class ImportacionHorarioService {
  private readonly logger = new Logger(ImportacionHorarioService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * RN-03: importa el horario académico como bloqueos de clase. Lo que choca con una reserva o con otro
   * bloqueo no se pisa ni se descarta en silencio: se omite y se reporta para reprogramar.
   */
  async importar(
    contenido: Buffer | undefined,
    usuario: UsuarioAutenticado,
    contexto: ContextoAuditoria,
  ): Promise<ReporteImportacionDto> {
    if (!contenido || contenido.length === 0) {
      throw new ErrorDominio('ARCHIVO_REQUERIDO', 'Adjunta el archivo CSV del horario.', 422);
    }
    if (contenido.length > TAMANO_MAXIMO_CSV) {
      throw new ErrorDominio('ARCHIVO_MUY_GRANDE', 'El archivo no puede superar 2 MB.', 422);
    }

    const { encabezados, filas } = leerCsv(decodificarCsv(contenido));
    const normalizados = encabezados.map(normalizarEncabezado);
    const faltantes = COLUMNAS.filter((c) => !normalizados.includes(c));
    if (faltantes.length > 0) {
      throw new ErrorDominio(
        'CSV_INVALIDO',
        `Al archivo le faltan las columnas: ${faltantes.join(', ')}.`,
        422,
        { faltantes },
      );
    }
    if (filas.length === 0) {
      throw new ErrorDominio('CSV_INVALIDO', 'El archivo no tiene filas de datos.', 422);
    }
    if (filas.length > MAXIMO_FILAS) {
      throw new ErrorDominio('CSV_INVALIDO', `El archivo no puede tener más de ${MAXIMO_FILAS} filas.`, 422);
    }

    const codigos = [
      ...new Set(
        filas
          .map((f) => this.valor(f.valores, 'espacio'))
          .filter((c) => c.length > 0),
      ),
    ];
    const espacios = await this.prisma.espacio.findMany({
      where: { codigo: { in: codigos }, archivadoEn: null },
      select: { id: true, codigo: true },
    });
    const porCodigo = new Map(espacios.map((e) => [e.codigo, e.id]));

    const errores: ErrorFilaDto[] = [];
    const conflictos: ConflictoImportacionDto[] = [];
    let bloqueosCreados = 0;
    let franjasCreadas = 0;

    for (const fila of filas) {
      const get = (clave: string) => this.valor(fila.valores, clave);
      const codigo = get('espacio');
      const espacioId = porCodigo.get(codigo);
      const dia = normalizarDia(get('dia'));
      const problema =
        !espacioId
          ? `El espacio «${codigo}» no existe.`
          : !dia
            ? `El día «${get('dia')}» no es válido. Usa LUN, MAR, MIE, JUE, VIE, SAB o DOM.`
            : !FORMATO_HORA.test(get('horainicio')) || !FORMATO_HORA.test(get('horafin'))
              ? 'Las horas deben tener el formato HH:MM.'
              : !FORMATO_FECHA.test(get('desde')) || !FORMATO_FECHA.test(get('hasta'))
                ? 'Las fechas deben tener el formato AAAA-MM-DD.'
                : null;
      if (problema || !espacioId || !dia) {
        errores.push({ fila: fila.linea, mensaje: problema ?? 'Fila inválida.' });
        continue;
      }

      const horaInicio = get('horainicio').padStart(5, '0');
      const horaFin = get('horafin').padStart(5, '0');
      if (horaFin <= horaInicio) {
        errores.push({ fila: fila.linea, mensaje: 'La hora de fin debe ser posterior a la de inicio.' });
        continue;
      }
      const desde = fechaReal(get('desde'));
      const hasta = fechaReal(get('hasta'));
      if (desde === null || hasta === null || hasta < desde) {
        errores.push({ fila: fila.linea, mensaje: 'El rango de fechas no es válido.' });
        continue;
      }
      if ((hasta - desde) / MS_DIA > MAXIMO_DIAS_POR_FILA) {
        errores.push({ fila: fila.linea, mensaje: `El rango no puede superar ${MAXIMO_DIAS_POR_FILA} días.` });
        continue;
      }

      const ocurrencias: Ocurrencia[] = [];
      for (let t = desde; t <= hasta; t += MS_DIA) {
        const fecha = new Date(t);
        if (fecha.getUTCDay() !== dia.numero) continue;
        const iso = fecha.toISOString().slice(0, 10);
        ocurrencias.push({
          inicio: new Date(`${iso}T${horaInicio}:00${DESFASE_BOGOTA}`),
          fin: new Date(`${iso}T${horaFin}:00${DESFASE_BOGOTA}`),
        });
      }
      if (ocurrencias.length === 0) {
        errores.push({ fila: fila.linea, mensaje: 'El rango de fechas no incluye ese día de la semana.' });
        continue;
      }

      const choques = await this.prisma.franjaOcupada.findMany({
        where: {
          espacioId,
          estado: { not: 'LIBERADA' },
          OR: ocurrencias.map((o) => ({ inicio: { lt: o.fin }, fin: { gt: o.inicio } })),
        },
        select: { inicio: true, fin: true, estado: true, origen: true },
      });
      const libres: Ocurrencia[] = [];
      for (const o of ocurrencias) {
        const choque = choques.find((c) => c.inicio < o.fin && c.fin > o.inicio);
        if (choque) {
          conflictos.push({
            fila: fila.linea,
            espacio: codigo,
            inicio: o.inicio.toISOString(),
            fin: o.fin.toISOString(),
            motivo: describirOcupacion(choque),
          });
        } else {
          libres.push(o);
        }
      }
      if (libres.length === 0) continue;

      try {
        await this.prisma.$transaction(async (tx) => {
          const bloqueo = await tx.bloqueoCalendario.create({
            data: {
              espacioId,
              motivo: 'CLASE',
              descripcion: limpiarDescripcion(get('descripcion')),
              inicio: libres[0]!.inicio,
              fin: libres[0]!.fin,
              rrule: `FREQ=WEEKLY;BYDAY=${dia.rrule}`,
              repetirHasta: libres[libres.length - 1]!.fin,
              origen: 'IMPORTACION_HORARIO',
              creadoPorId: usuario.id,
            },
            select: { id: true },
          });
          await tx.franjaOcupada.createMany({
            data: libres.map((o) => ({
              espacioId,
              inicio: o.inicio,
              fin: o.fin,
              estado: 'BLOQUEO' as const,
              origen: 'CLASE' as const,
              bloqueoId: bloqueo.id,
              etiquetaPublica: null,
            })),
          });
        });
        bloqueosCreados += 1;
        franjasCreadas += libres.length;
      } catch (error) {
        if (!esViolacionDeExclusion(error)) {
          this.logger.error(
            `No se pudo importar la fila ${fila.linea}.`,
            error instanceof Error ? error.stack : String(error),
          );
          errores.push({ fila: fila.linea, mensaje: 'No se pudo guardar la fila por un error interno.' });
          continue;
        }
        for (const o of libres) {
          conflictos.push({
            fila: fila.linea,
            espacio: codigo,
            inicio: o.inicio.toISOString(),
            fin: o.fin.toISOString(),
            motivo: 'Otra operación ocupó el horario mientras se importaba.',
          });
        }
      }
    }

    await this.prisma.bitacora.create({
      data: {
        usuarioId: usuario.id,
        accion: 'HORARIO_IMPORTADO',
        entidad: 'BloqueoCalendario',
        entidadId: null,
        ip: contexto.ip,
        userAgent: contexto.userAgent,
        correlacionId: contexto.correlacionId,
        datosDespues: {
          filasLeidas: filas.length,
          bloqueosCreados,
          franjasCreadas,
          conflictos: conflictos.length,
          errores: errores.length,
        },
      },
    });

    return { filasLeidas: filas.length, bloqueosCreados, franjasCreadas, conflictos, errores };
  }

  private valor(valores: Record<string, string>, clave: string): string {
    for (const [encabezado, texto] of Object.entries(valores)) {
      if (normalizarEncabezado(encabezado) === clave) return texto.trim();
    }
    return '';
  }
}
