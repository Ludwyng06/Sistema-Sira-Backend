import { Injectable } from '@nestjs/common';
import { EstadoSolicitud, TipoSolicitante } from '../../../generated/prisma/enums.js';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ConsecutivoService } from '../../../shared/consecutivos/consecutivo.service.js';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import { ParametroService } from '../../../shared/parametros/parametro.service.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { diaSemanaLocal, diasHabilesEntre, fechaLocal } from '../../../shared/tiempo/zona-horaria.js';
import { BusquedaService } from '../../disponibilidad/services/busqueda.service.js';
import { evaluarAforo } from '../../inventario/dominio/aforo.js';
import { NotificacionesService } from '../../notificaciones/services/notificaciones.service.js';
import { TarifarioService } from '../../tarifario/services/tarifario.service.js';
import { validarTransicion } from '../dominio/maquina-estados.js';
import type { AdvertenciaEnvioDto, SolicitudEnviadaDto } from '../dto/solicitud.dto.js';
import { aDto, SolicitudesService } from './solicitudes.service.js';

export interface ContextoEnvio {
  ip: string | null;
  userAgent: string | null;
  correlacionId: string | null;
}

export interface EspacioSugerido {
  espacioId: string;
  codigo: string;
  nombre: string;
  capacidadPersonas: number;
  bloque: string;
  sede: string;
}

export interface ProblemaEnvio {
  codigo: string;
  mensaje: string;
  reservaId?: string;
  sugerencias?: EspacioSugerido[];
}

const MAXIMO_SUGERENCIAS = 5;

interface Intervalo {
  inicio: Date;
  fin: Date;
}

const MS_MINUTO = 60_000;
const MS_HORA = 3_600_000;
const MS_DIA = 86_400_000;
const CODIGO_EXCLUSION = '23P01';
const FORMATO_HORA = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Bogota',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function horaLocal(instante: Date, esFin = false): string {
  const hora = FORMATO_HORA.format(instante);
  return esFin && hora === '00:00' ? '24:00' : hora;
}

function esViolacionDeExclusion(error: unknown): boolean {
  const texto = JSON.stringify(error, Object.getOwnPropertyNames(error ?? {}));
  return texto.includes(CODIGO_EXCLUSION) || texto.includes('sin_solapamiento');
}

function dosDecimales(valor: number): number {
  return Math.round(valor * 100) / 100;
}

@Injectable()
export class EnvioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly solicitudes: SolicitudesService,
    private readonly tarifario: TarifarioService,
    private readonly consecutivos: ConsecutivoService,
    private readonly parametros: ParametroService,
    private readonly notificaciones: NotificacionesService,
    private readonly busqueda: BusquedaService,
  ) {}

  /** UC-01. Valida, evalúa la exención, retiene las franjas y deja la solicitud EN_REVISION. */
  async enviar(id: string, usuario: UsuarioAutenticado, contexto: ContextoEnvio): Promise<SolicitudEnviadaDto> {
    const borrador = await this.solicitudes.borradorPropio(id, usuario);
    const ahora = new Date();

    const cuenta = await this.prisma.usuario.findUnique({
      where: { id: usuario.id },
      select: { correoVerificado: true, esInstitucional: true },
    });
    if (!cuenta?.correoVerificado) {
      throw new ErrorDominio(
        'CORREO_NO_VERIFICADO',
        'Verifica tu correo para poder enviar solicitudes.',
        422,
      );
    }

    const reservas = await this.prisma.reservaItem.findMany({
      where: { solicitudId: id },
      orderBy: { inicio: 'asc' },
      include: {
        espacio: {
          select: {
            id: true,
            archivadoEn: true,
            esReservable: true,
            estado: true,
            capacidadPersonas: true,
            minutosMontaje: true,
            minutosDesmontaje: true,
            responsableId: true,
            tipo: {
              select: { anticipacionMinimaDias: true, anticipacionEnHabiles: true, aforoExigePoliza: true },
            },
            horarios: { select: { diaSemana: true, abre: true, cierra: true } },
          },
        },
      },
    });
    if (reservas.length === 0) {
      throw new ErrorDominio(
        'SOLICITUD_SIN_RESERVAS',
        'Agrega al menos un espacio con su horario antes de enviar la solicitud.',
        422,
      );
    }

    const primerInicio = reservas[0]!.inicio;
    const festivos = await this.prisma.festivo.findMany({
      where: {
        fecha: {
          gte: new Date(`${fechaLocal(ahora)}T00:00:00.000Z`),
          lte: new Date(`${fechaLocal(reservas[reservas.length - 1]!.fin)}T00:00:00.000Z`),
        },
      },
      select: { fecha: true },
    });
    const festivosIso = festivos.map((f) => f.fecha.toISOString().slice(0, 10));

    const problemas: ProblemaEnvio[] = [];
    const advertencias: AdvertenciaEnvioDto[] = [];
    let anticipacionMaxima = 0;
    for (const item of reservas) {
      const espacio = item.espacio;
      if (espacio.archivadoEn || !espacio.esReservable || espacio.estado === 'FUERA_DE_SERVICIO') {
        problemas.push({
          codigo: 'ESPACIO_NO_DISPONIBLE',
          mensaje: 'Uno de los espacios ya no está disponible para reservar.',
          reservaId: item.id,
        });
        continue;
      }

      // Un espacio sin horario configurado no se restringe; con horario, los días sin fila están cerrados.
      const horario = espacio.horarios.find((h) => h.diaSemana === diaSemanaLocal(item.inicio));
      if (
        espacio.horarios.length > 0 &&
        (!horario || horaLocal(item.inicio) < horario.abre || horaLocal(item.fin, true) > horario.cierra)
      ) {
        problemas.push({
          codigo: 'FUERA_DE_HORARIO',
          mensaje: horario
            ? `El espacio opera de ${horario.abre} a ${horario.cierra} ese día.`
            : 'El espacio no opera el día seleccionado.',
          reservaId: item.id,
        });
      }

      const { anticipacionMinimaDias: minimo, anticipacionEnHabiles: enHabiles } = espacio.tipo;
      anticipacionMaxima = Math.max(anticipacionMaxima, minimo);
      const diasDisponibles = enHabiles
        ? diasHabilesEntre(ahora, item.inicio, festivosIso)
        : Math.round(
            (Date.parse(`${fechaLocal(item.inicio)}T00:00:00Z`) - Date.parse(`${fechaLocal(ahora)}T00:00:00Z`)) /
              MS_DIA,
          );
      if (diasDisponibles < minimo) {
        problemas.push({
          codigo: 'ANTICIPACION_INSUFICIENTE',
          mensaje: `Este tipo de espacio se solicita con ${minimo} día${minimo === 1 ? '' : 's'}${
            enHabiles ? ' hábiles' : ''
          } de anticipación.`,
          reservaId: item.id,
        });
      }

      if (borrador.asistentesEstimados > espacio.capacidadPersonas) {
        problemas.push({
          codigo: 'AFORO_EXCEDIDO',
          mensaje:
            `El espacio tiene capacidad para ${espacio.capacidadPersonas} personas ` +
            `y tu evento es de ${borrador.asistentesEstimados}.`,
          reservaId: item.id,
          sugerencias: await this.sugerir(item, borrador.asistentesEstimados),
        });
      } else {
        const aforo = evaluarAforo(espacio.capacidadPersonas, borrador.asistentesEstimados);
        if (aforo.nivel === 'SOBRA_ESPACIO') {
          advertencias.push({
            codigo: 'ESPACIO_SOBRADO',
            mensaje: aforo.mensaje,
            reservaId: item.id,
            sugerencias: await this.sugerir(item, borrador.asistentesEstimados),
          });
        }
      }
    }

    const umbralPoliza = reservas
      .map((r) => r.espacio.tipo.aforoExigePoliza)
      .filter((v): v is number => v !== null)
      .reduce<number | null>((menor, v) => (menor === null || v < menor ? v : menor), null);
    if (umbralPoliza !== null && borrador.asistentesEstimados > umbralPoliza) {
      const poliza = await this.prisma.documentoAdjunto.count({ where: { solicitudId: id, tipo: 'POLIZA' } });
      if (poliza === 0) {
        problemas.push({
          codigo: 'POLIZA_REQUERIDA',
          mensaje: 'Para este aforo debes adjuntar la póliza de responsabilidad civil.',
        });
      }
    }

    const horasRevision = await this.parametros.obtenerNumero('horas_plazo_revision');
    const venceEn = new Date(
      Math.min(
        ahora.getTime() + horasRevision * MS_HORA,
        primerInicio.getTime() - anticipacionMaxima * MS_DIA,
      ),
    );
    if (venceEn.getTime() <= ahora.getTime()) {
      problemas.push({
        codigo: 'PLAZO_INSUFICIENTE',
        mensaje: 'No hay tiempo suficiente para revisar la solicitud antes del evento.',
      });
    }

    if (problemas.length > 0) {
      throw new ErrorDominio(
        'SOLICITUD_INCOMPLETA',
        'Corrige los problemas de la solicitud antes de enviarla.',
        422,
        { problemas },
      );
    }

    const intervalos: Intervalo[] = reservas.map((r) => ({
      inicio: new Date(r.inicio.getTime() - r.espacio.minutosMontaje * MS_MINUTO),
      fin: new Date(r.fin.getTime() + r.espacio.minutosDesmontaje * MS_MINUTO),
    }));

    const choques = await this.prisma.franjaOcupada.findMany({
      where: {
        estado: { not: 'LIBERADA' },
        OR: reservas.map((r, i) => ({
          espacioId: r.espacioId,
          inicio: { lt: intervalos[i]!.fin },
          fin: { gt: intervalos[i]!.inicio },
        })),
      },
      select: { espacioId: true, inicio: true, fin: true },
      orderBy: { inicio: 'asc' },
    });
    if (choques.length > 0) {
      const ocupados = new Set(choques.map((c) => c.espacioId));
      const sugerencias = [];
      for (const r of reservas.filter((x) => ocupados.has(x.espacioId))) {
        sugerencias.push({ reservaId: r.id, espacios: await this.sugerir(r, borrador.asistentesEstimados) });
      }
      throw this.conflicto(choques, sugerencias);
    }

    const exenta =
      cuenta.esInstitucional &&
      cuenta.correoVerificado &&
      borrador.declaraUsoInstitucional &&
      borrador.dependenciaId !== null;
    const perfil = await this.prisma.solicitante.findUnique({
      where: { id: borrador.solicitanteId },
      select: { tipo: true },
    });
    const particularDeInterno =
      !exenta && perfil?.tipo === TipoSolicitante.INTERNO && !borrador.declaraUsoInstitucional;
    const tipoTarifa = exenta
      ? TipoSolicitante.INTERNO
      : particularDeInterno
        ? TipoSolicitante.PERSONA_NATURAL
        : (perfil?.tipo ?? borrador.tipoTarifa);

    const estimados = await Promise.all(
      reservas.map((r) =>
        this.tarifario.calcular({ espacioId: r.espacioId, tipoSolicitante: tipoTarifa, inicio: r.inicio, fin: r.fin }),
      ),
    );

    const enviada = validarTransicion(EstadoSolicitud.BORRADOR, 'ENVIAR');
    const enRevision = validarTransicion(enviada, 'ENRUTAR');

    try {
      const fila = await this.prisma.$transaction(async (tx) => {
        // Guarda de concurrencia: solo un envío puede sacar la solicitud de BORRADOR.
        const guarda = await tx.solicitud.updateMany({
          where: { id, estado: EstadoSolicitud.BORRADOR },
          data: { actualizadoEn: new Date() },
        });
        if (guarda.count === 0) {
          throw new ErrorDominio('SOLICITUD_NO_EDITABLE', 'Esta solicitud ya fue enviada o cambió de estado.', 409);
        }
        const vigentes = await tx.reservaItem.count({ where: { solicitudId: id } });
        if (vigentes !== reservas.length) {
          throw new ErrorDominio(
            'SOLICITUD_MODIFICADA',
            'La solicitud cambió mientras se enviaba. Revísala e intenta de nuevo.',
            409,
          );
        }
        const consecutivo = await this.consecutivos.siguiente(tx, 'SOLICITUD');
        for (const [i, r] of reservas.entries()) {
          const estimado = estimados[i]!;
          const cantidad = estimado.lineas.reduce((suma, l) => suma + l.cantidad, 0);
          const unidades = new Set(estimado.lineas.map((l) => l.unidad));
          const unica = unidades.size === 1 ? [...unidades][0]! : null;
          await tx.franjaOcupada.create({
            data: {
              espacioId: r.espacioId,
              inicio: intervalos[i]!.inicio,
              fin: intervalos[i]!.fin,
              estado: 'RETENIDA',
              origen: 'RESERVA',
              reservaItemId: r.id,
              retenidaHasta: venceEn,
              etiquetaPublica: borrador.eventoPublico ? borrador.objetoEvento : null,
            },
          });
          await tx.reservaItem.update({
            where: { id: r.id },
            data: {
              unidad: unica && unica !== 'JORNADAS' ? unica : null,
              cantidad: dosDecimales(cantidad),
              valorUnitario: cantidad > 0 ? Math.round(estimado.base / cantidad) : 0,
              recargos: estimado.recargos,
              subtotal: estimado.subtotal,
            },
          });
        }
        const actualizada = await tx.solicitud.update({
          where: { id },
          data: {
            consecutivo,
            estado: enRevision,
            enviadaEn: ahora,
            venceEn,
            esExenta: exenta,
            tipoTarifa,
          },
        });
        await tx.historialEstadoSolicitud.createMany({
          data: [
            { solicitudId: id, estadoAnterior: EstadoSolicitud.BORRADOR, estadoNuevo: enviada, usuarioId: usuario.id },
            { solicitudId: id, estadoAnterior: enviada, estadoNuevo: enRevision, usuarioId: usuario.id },
          ],
        });
        await tx.bitacora.create({
          data: {
            usuarioId: usuario.id,
            accion: 'SOLICITUD_ENVIADA',
            entidad: 'Solicitud',
            entidadId: id,
            ip: contexto.ip,
            userAgent: contexto.userAgent,
            correlacionId: contexto.correlacionId,
            datosDespues: {
              consecutivo,
              esExenta: exenta,
              tipoTarifa,
              particularDeInterno,
              venceEn: venceEn.toISOString(),
            },
          },
        });
        return actualizada;
      });
      const responsables = [
        ...new Set(reservas.map((r) => r.espacio.responsableId).filter((v): v is string => !!v)),
      ];
      const etiqueta = fila.consecutivo ?? 'tu solicitud';
      await Promise.all([
        this.notificaciones.notificarSolicitante(id, {
          titulo: `Recibimos tu solicitud ${etiqueta}`,
          cuerpo: 'Quedó en revisión y los horarios están retenidos. Te avisaremos cuando haya una decisión.',
        }),
        ...responsables.map((responsableId) =>
          this.notificaciones.notificarUsuario(responsableId, {
            titulo: `Nueva solicitud ${etiqueta} por avalar`,
            cuerpo: 'Un espacio a tu cargo fue solicitado. Revisa el detalle y registra tu decisión.',
            enlace: `/solicitudes/${id}`,
          }),
        ),
      ]);
      return { ...aDto(fila), advertencias };
    } catch (error) {
      if (esViolacionDeExclusion(error)) throw this.conflicto([]);
      throw error;
    }
  }

  /** Espacios libres en ese mismo horario donde caben los asistentes (RN-18, UC-01 paso 6). */
  private async sugerir(
    reserva: { espacioId: string; inicio: Date; fin: Date },
    asistentes: number,
  ): Promise<EspacioSugerido[]> {
    try {
      const resultado = await this.busqueda.buscar({
        fecha: fechaLocal(reserva.inicio),
        horaInicio: horaLocal(reserva.inicio),
        horaFin: horaLocal(reserva.fin, true),
        asistentes,
      });
      return resultado.espacios
        .filter((e) => e.espacioId !== reserva.espacioId)
        .slice(0, MAXIMO_SUGERENCIAS)
        .map((e) => ({
          espacioId: e.espacioId,
          codigo: e.codigo,
          nombre: e.nombre,
          capacidadPersonas: e.capacidadPersonas,
          bloque: e.bloque.codigo,
          sede: e.sede.codigo,
        }));
    } catch {
      return [];
    }
  }

  private conflicto(
    choques: { espacioId?: string; inicio: Date; fin: Date }[],
    sugerencias: { reservaId: string; espacios: EspacioSugerido[] }[] = [],
  ): ErrorDominio {
    return new ErrorDominio(
      'FRANJA_NO_DISPONIBLE',
      'Alguno de los espacios ya fue ocupado en ese horario. Elige otro horario o espacio.',
      409,
      {
        conflictos: choques.map((c) => ({
          espacioId: c.espacioId ?? null,
          inicio: c.inicio.toISOString(),
          fin: c.fin.toISOString(),
        })),
        sugerencias,
      },
    );
  }
}
