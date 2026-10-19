import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EstadoOrdenPago, EstadoSolicitud } from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { NotificacionesService } from '../../notificaciones/services/notificaciones.service.js';
import { validarTransicion } from '../dominio/maquina-estados.js';

export interface ResultadoVencimientos {
  solicitudes: number;
  ordenes: number;
}

const ESTADOS_CON_PLAZO: EstadoSolicitud[] = [
  EstadoSolicitud.ENVIADA,
  EstadoSolicitud.EN_REVISION,
  EstadoSolicitud.COTIZADA,
  EstadoSolicitud.PAGO_PENDIENTE,
];

/**
 * RN-02: libera las solicitudes cuyo plazo de revisión o de pago venció. Una orden de pago en
 * verificación no vence mientras tesorería no decida. Se programa cada 5 minutos (03-backend §9).
 */
@Injectable()
export class VencimientosService {
  private readonly logger = new Logger(VencimientosService.name);
  private enCurso = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  @Cron('0 */5 * * * *')
  async programado(): Promise<void> {
    if (this.enCurso) return;
    this.enCurso = true;
    try {
      const r = await this.ejecutar();
      if (r.solicitudes > 0 || r.ordenes > 0) {
        this.logger.log(`Vencimientos: ${r.solicitudes} solicitudes y ${r.ordenes} órdenes.`);
      }
    } catch (error) {
      this.logger.error('Falló el job de vencimientos.', error instanceof Error ? error.stack : String(error));
    } finally {
      this.enCurso = false;
    }
  }

  async ejecutar(ahora: Date = new Date()): Promise<ResultadoVencimientos> {
    const candidatas = await this.prisma.solicitud.findMany({
      where: { estado: { in: ESTADOS_CON_PLAZO }, venceEn: { lte: ahora } },
      select: {
        id: true,
        consecutivo: true,
        estado: true,
        reservas: { select: { id: true } },
      },
    });

    let solicitudes = 0;
    for (const candidata of candidatas) {
      try {
        if (await this.vencer(candidata)) solicitudes += 1;
      } catch (error) {
        this.logger.error(
          `No se pudo vencer la solicitud ${candidata.id}.`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    const { count: ordenes } = await this.prisma.ordenPago.updateMany({
      where: { estado: EstadoOrdenPago.PENDIENTE, venceEn: { lte: ahora } },
      data: { estado: EstadoOrdenPago.VENCIDA },
    });
    return { solicitudes, ordenes };
  }

  private async vencer(candidata: {
    id: string;
    consecutivo: string | null;
    estado: EstadoSolicitud;
    reservas: { id: string }[];
  }): Promise<boolean> {
    if (candidata.estado === EstadoSolicitud.PAGO_PENDIENTE) {
      const enVerificacion = await this.prisma.ordenPago.count({
        where: { estado: EstadoOrdenPago.EN_VERIFICACION, cotizacion: { solicitudId: candidata.id } },
      });
      if (enVerificacion > 0) return false;
    }

    const destino = validarTransicion(candidata.estado, 'VENCER');
    const vencida = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.solicitud.updateMany({
        where: { id: candidata.id, estado: candidata.estado },
        data: { estado: destino, venceEn: null },
      });
      if (count === 0) return false;
      await tx.franjaOcupada.updateMany({
        where: { reservaItemId: { in: candidata.reservas.map((r) => r.id) }, estado: { not: 'LIBERADA' } },
        data: { estado: 'LIBERADA', retenidaHasta: null },
      });
      await tx.ordenPago.updateMany({
        where: { estado: EstadoOrdenPago.PENDIENTE, cotizacion: { solicitudId: candidata.id } },
        data: { estado: EstadoOrdenPago.VENCIDA },
      });
      await tx.historialEstadoSolicitud.create({
        data: {
          solicitudId: candidata.id,
          estadoAnterior: candidata.estado,
          estadoNuevo: destino,
          usuarioId: null,
          observacion: 'Vencida por plazo',
        },
      });
      await tx.bitacora.create({
        data: {
          usuarioId: null,
          accion: 'SOLICITUD_VENCIDA',
          entidad: 'Solicitud',
          entidadId: candidata.id,
          datosDespues: { estadoAnterior: candidata.estado, consecutivo: candidata.consecutivo },
        },
      });
      return true;
    });
    if (!vencida) return false;

    const etiqueta = candidata.consecutivo ?? 'tu solicitud';
    await this.notificaciones.notificarSolicitante(candidata.id, {
      titulo: `Tu solicitud ${etiqueta} venció`,
      cuerpo:
        candidata.estado === EstadoSolicitud.EN_REVISION || candidata.estado === EstadoSolicitud.ENVIADA
          ? 'La solicitud no fue revisada a tiempo y se liberó el horario reservado. Puedes crear una nueva.'
          : 'El plazo de pago terminó y se liberó el horario reservado. Si ya consignaste, comunícate con tesorería.',
    });
    return true;
  }
}
