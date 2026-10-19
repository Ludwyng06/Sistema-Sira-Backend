import { Injectable } from '@nestjs/common';
import { EstadoSolicitud, Rol } from '../../../generated/prisma/enums.js';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ErrorDominio, noEncontrado } from '../../../shared/errores/error-dominio.js';
import { ParametroService } from '../../../shared/parametros/parametro.service.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { fechaLocal } from '../../../shared/tiempo/zona-horaria.js';
import { NotificacionesService } from '../../notificaciones/services/notificaciones.service.js';
import { TransicionInvalida, validarTransicion } from '../dominio/maquina-estados.js';
import type { CancelarSolicitudDto, CancelacionDto } from '../dto/cancelacion.dto.js';

export interface ContextoCancelacion {
  ip: string | null;
  userAgent: string | null;
  correlacionId: string | null;
}

export interface TramoReembolso {
  diasAntes: number;
  porcentaje: number;
}

const MS_DIA = 86_400_000;

function noCancelable(mensaje: string): ErrorDominio {
  return new ErrorDominio('SOLICITUD_NO_CANCELABLE', mensaje, 409);
}

/** Porcentaje del primer tramo (de mayor a menor antelación) que la cancelación alcanza a cumplir. */
export function porcentajeReembolso(tramos: TramoReembolso[], diasDeAntelacion: number): number {
  const ordenados = [...tramos].sort((a, b) => b.diasAntes - a.diasAntes);
  return ordenados.find((t) => diasDeAntelacion >= t.diasAntes)?.porcentaje ?? 0;
}

function leerPolitica(valor: unknown): TramoReembolso[] {
  if (
    !Array.isArray(valor) ||
    !valor.every(
      (t): t is TramoReembolso =>
        typeof t === 'object' &&
        t !== null &&
        typeof (t as TramoReembolso).diasAntes === 'number' &&
        typeof (t as TramoReembolso).porcentaje === 'number',
    )
  ) {
    throw new Error('El parámetro "politica_cancelacion" debe ser una lista de { diasAntes, porcentaje }.');
  }
  return valor;
}

@Injectable()
export class CancelacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametroService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  /** RN-14: libera las franjas y calcula el reembolso según la política (100 % si la causa es institucional). */
  async cancelar(
    id: string,
    datos: CancelarSolicitudDto,
    usuario: UsuarioAutenticado,
    contexto: ContextoCancelacion,
  ): Promise<CancelacionDto> {
    const esAdministrador = usuario.roles.includes(Rol.ADMINISTRADOR);
    const perfil = await this.prisma.solicitante.findUnique({
      where: { usuarioId: usuario.id },
      select: { id: true },
    });
    const solicitud = await this.prisma.solicitud.findFirst({
      where: {
        id,
        OR: [...(perfil ? [{ solicitanteId: perfil.id }] : []), ...(esAdministrador ? [{}] : [])],
      },
      include: {
        reservas: { select: { id: true, inicio: true }, orderBy: { inicio: 'asc' } },
        cotizaciones: { orderBy: { creadaEn: 'desc' }, take: 1 },
      },
    });
    if (!solicitud || (!perfil && !esAdministrador)) throw noEncontrado('La solicitud');

    try {
      validarTransicion(solicitud.estado, 'CANCELAR');
    } catch (error) {
      if (!(error instanceof TransicionInvalida)) throw error;
      throw noCancelable('Solo se puede cancelar una solicitud confirmada.');
    }

    const ahora = new Date();
    const primerInicio = solicitud.reservas[0]?.inicio;
    if (!primerInicio || primerInicio <= ahora) {
      throw noCancelable('El evento ya empezó, por lo que la solicitud no se puede cancelar.');
    }

    const institucional = esAdministrador && perfil?.id !== solicitud.solicitanteId;
    const diasDeAntelacion = Math.floor(
      (Date.parse(`${fechaLocal(primerInicio)}T00:00:00Z`) - Date.parse(`${fechaLocal(ahora)}T00:00:00Z`)) /
        MS_DIA,
    );
    const politica = leerPolitica(await this.parametros.obtenerJson('politica_cancelacion'));
    const cotizacion = solicitud.cotizaciones[0];
    const cobrada = cotizacion !== undefined && !cotizacion.esExenta && cotizacion.total > 0;
    const porcentaje = !cobrada ? 0 : institucional ? 100 : porcentajeReembolso(politica, diasDeAntelacion);
    const valorReembolso = cobrada ? Math.round((cotizacion.total * porcentaje) / 100) : 0;
    const motivo = datos.motivo.trim();

    const cancelada = await this.prisma.$transaction(async (tx) => {
      const destino = validarTransicion(solicitud.estado, 'CANCELAR');
      const { count } = await tx.solicitud.updateMany({
        where: { id, estado: solicitud.estado },
        data: { actualizadoEn: new Date() },
      });
      if (count === 0) throw noCancelable('La solicitud cambió de estado mientras se cancelaba.');
      await tx.solicitud.update({
        where: { id },
        data: {
          estado: destino,
          motivoCancelacion: motivo,
          canceladaPorInstitucion: institucional,
          venceEn: null,
        },
      });
      await tx.franjaOcupada.updateMany({
        where: { reservaItemId: { in: solicitud.reservas.map((r) => r.id) }, estado: { not: 'LIBERADA' } },
        data: { estado: 'LIBERADA', retenidaHasta: null },
      });
      await tx.historialEstadoSolicitud.create({
        data: {
          solicitudId: id,
          estadoAnterior: solicitud.estado,
          estadoNuevo: destino,
          usuarioId: usuario.id,
          observacion: motivo,
        },
      });
      await tx.bitacora.create({
        data: {
          usuarioId: usuario.id,
          accion: 'SOLICITUD_CANCELADA',
          entidad: 'Solicitud',
          entidadId: id,
          ip: contexto.ip,
          userAgent: contexto.userAgent,
          correlacionId: contexto.correlacionId,
          datosDespues: {
            motivo,
            institucional,
            diasDeAntelacion,
            porcentajeReembolso: porcentaje,
            valorReembolso,
          },
        },
      });
      return {
        estadoSolicitud: EstadoSolicitud.CANCELADA,
        porcentajeReembolso: porcentaje,
        valorReembolso,
        canceladaPorInstitucion: institucional,
      };
    });
    await this.notificaciones.notificarSolicitante(id, {
      titulo: `Solicitud ${solicitud.consecutivo ?? 'sin consecutivo'} cancelada`,
      cuerpo: institucional
        ? `La institución canceló tu reserva. Motivo: ${motivo}. El reembolso es del ${porcentaje} %.`
        : `Cancelaste tu reserva. Reembolso del ${porcentaje} % (${valorReembolso} pesos).`,
    });
    return cancelada;
  }
}
