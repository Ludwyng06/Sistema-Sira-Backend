import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ParametroService } from '../../../shared/parametros/parametro.service.js';
import { ConsecutivoService } from '../../../shared/consecutivos/consecutivo.service.js';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import { transicionOConflicto } from '../../reservas/dominio/maquina-estados.js';
import { distribuirPago, vencimientoSaldo } from '../dominio/pagos-parciales.js';

type Orden = Prisma.OrdenPagoGetPayload<Record<string, never>>;
@Injectable()
export class PagosParcialesService {
  private readonly logger = new Logger(PagosParcialesService.name);
  private enCurso = false;
  constructor(private readonly prisma: PrismaService, private readonly parametros: ParametroService,
    private readonly consecutivos: ConsecutivoService) {}

  async planInicial(total: number, solicitudId: string) {
    const porcentaje = await this.parametros.obtenerNumero('PORCENTAJE_ANTICIPO', 0);
    const distribucion = distribuirPago(total, porcentaje);
    let saldoVenceEn: Date | null = null;
    if (distribucion.saldo > 0) {
      const dias = await this.parametros.obtenerNumero('DIAS_SALDO_ANTES_EVENTO', 3);
      const primera = await this.prisma.reservaItem.findFirst({ where: { solicitudId }, orderBy: { inicio: 'asc' }, select: { inicio: true } });
      if (!primera) throw new ErrorDominio('SOLICITUD_SIN_FRANJAS', 'La solicitud debe tener una primera franja para fijar el saldo.', 409);
      saldoVenceEn = vencimientoSaldo(primera.inicio, dias);
      if (saldoVenceEn <= new Date()) throw new ErrorDominio('SALDO_VENCIDO', 'El plazo del saldo ya terminó; revisa la anticipación del evento.', 409);
    }
    return { ...distribucion, saldoVenceEn };
  }

  /** Se llama bajo bloqueo de la solicitud y después de aprobar el anticipo, en la misma transacción. */
  async asegurarSaldo(tx: Prisma.TransactionClient, anticipo: Pick<Orden, 'id' | 'cotizacionId' | 'valor'>): Promise<Orden | null> {
    const existente = await tx.ordenPago.findFirst({ where: { cotizacionId: anticipo.cotizacionId, tipo: 'SALDO',
      estado: { in: ['PENDIENTE', 'EN_VERIFICACION', 'APROBADA'] } }, orderBy: { creadaEn: 'desc' } });
    if (existente) return existente;
    const cotizacion = await tx.cotizacion.findUniqueOrThrow({ where: { id: anticipo.cotizacionId },
      include: { solicitud: { include: { solicitante: { select: { usuarioId: true } } } } } });
    const saldo = cotizacion.total + cotizacion.depositoGarantia - anticipo.valor;
    if (!Number.isSafeInteger(saldo) || saldo < 0 || saldo > 2147483647) throw new ErrorDominio('VALOR_INVALIDO', 'El saldo no es válido.', 422);
    if (saldo === 0) return null;
    const registro = await tx.bitacora.findFirst({ where: { entidad: 'OrdenPago', entidadId: anticipo.id, accion: 'ORDEN_PAGO_CREADA' }, orderBy: { id: 'desc' } });
    const datos = registro?.datosDespues as { saldoVenceEn?: unknown } | null;
    if (typeof datos?.saldoVenceEn !== 'string') throw new ErrorDominio('PLAN_PAGO_INVALIDO', 'No existe el plazo congelado del saldo; consulta con tesorería.', 409);
    const venceEn = new Date(datos.saldoVenceEn);
    if (!Number.isFinite(venceEn.getTime())) throw new ErrorDominio('PLAN_PAGO_INVALIDO', 'El plazo congelado del saldo no es válido.', 409);
    const creada = await tx.ordenPago.create({ data: { referencia: await this.consecutivos.siguiente(tx, 'ORDEN_PAGO'),
      cotizacionId: anticipo.cotizacionId, valor: saldo, tipo: 'SALDO', medio: 'CONSIGNACION', venceEn } });
    await tx.bitacora.create({ data: { accion: 'SALDO_CREADO', entidad: 'OrdenPago', entidadId: creada.id,
      datosDespues: { anticipoId: anticipo.id, total: cotizacion.total + cotizacion.depositoGarantia, anticipo: anticipo.valor,
        saldo, venceEn: venceEn.toISOString(), referencia: creada.referencia } } });
    await tx.notificacion.create({ data: { usuarioId: cotizacion.solicitud.solicitante.usuarioId, titulo: `Saldo pendiente ${creada.referencia}`,
      cuerpo: `El anticipo aseguró tu reserva. Paga ${saldo} pesos de saldo antes de ${venceEn.toISOString()}.`, enlace: `/solicitudes/${cotizacion.solicitudId}` } });
    return creada;
  }

  @Cron('0 */15 * * * *')
  async revisarSaldos(ahora = new Date()): Promise<void> {
    if (this.enCurso) return; this.enCurso = true;
    try {
      const candidatas = await this.prisma.ordenPago.findMany({ where: { tipo: 'SALDO',
        estado: { notIn: ['APROBADA', 'EN_VERIFICACION'] }, venceEn: { lte: new Date(ahora.getTime() + 86400_000) },
        cotizacion: { solicitud: { estado: 'CONFIRMADA' } } }, orderBy: { creadaEn: 'desc' }, include: { cotizacion: true } });
      const vistas = new Set<string>();
      for (const orden of candidatas) {
        if (vistas.has(orden.cotizacionId)) continue; vistas.add(orden.cotizacionId);
        try { await this.revisarUna(orden.id, orden.cotizacion.solicitudId, ahora); }
        catch (error) { this.logger.error(`No se pudo revisar el saldo ${orden.id}.`, error instanceof Error ? error.stack : String(error)); }
      }
    } catch (error) { this.logger.error('No se pudo ejecutar la revisión de saldos.', error instanceof Error ? error.stack : String(error)); }
    finally { this.enCurso = false; }
  }

  async revisarUna(ordenId: string, solicitudId: string, ahora: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const bloqueo = await tx.solicitud.updateMany({ where: { id: solicitudId, estado: 'CONFIRMADA' }, data: { actualizadoEn: ahora } });
      if (!bloqueo.count) return;
      const orden = await tx.ordenPago.findUniqueOrThrow({ where: { id: ordenId } });
      if (orden.tipo !== 'SALDO') return;
      // Bloquea todas las órdenes de saldo ANTES de comprobar soportes o aprobación concurrentes.
      await tx.$queryRaw`SELECT id FROM orden_pago WHERE cotizacion_id = ${orden.cotizacionId}::uuid AND tipo = 'SALDO' ORDER BY id FOR UPDATE`;
      const protegidas = await tx.ordenPago.count({ where: { cotizacionId: orden.cotizacionId, tipo: 'SALDO',
        estado: { in: ['APROBADA', 'EN_VERIFICACION'] } } });
      if (protegidas > 0) return;
      const actual = await tx.ordenPago.findUniqueOrThrow({ where: { id: ordenId } });
      const vencida = actual.venceEn <= ahora;
      if (!vencida && actual.venceEn.getTime() > ahora.getTime() + 86400_000) return;
      const accion = vencida ? 'SALDO_VENCIDO' : 'SALDO_POR_VENCER';
      if (await tx.bitacora.findFirst({ where: { accion, entidad: 'OrdenPago', entidadId: ordenId } })) return;
      const solicitud = await tx.solicitud.findUniqueOrThrow({ where: { id: solicitudId }, include: { solicitante: true, reservas: true } });
      if (vencida) {
        const destino = transicionOConflicto(solicitud.estado, 'VENCER_SALDO');
        await tx.solicitud.update({ where: { id: solicitudId }, data: { estado: destino, venceEn: null } });
        await tx.franjaOcupada.updateMany({ where: { reservaItemId: { in: solicitud.reservas.map((r) => r.id) }, estado: { not: 'LIBERADA' } }, data: { estado: 'LIBERADA', retenidaHasta: null } });
        await tx.ordenPago.updateMany({ where: { cotizacionId: orden.cotizacionId, tipo: 'SALDO', estado: 'PENDIENTE' }, data: { estado: 'VENCIDA' } });
        await tx.historialEstadoSolicitud.create({ data: { solicitudId, estadoAnterior: solicitud.estado, estadoNuevo: destino, observacion: `Saldo vencido ${orden.referencia}; revisar anticipo con tesorería.` } });
      }
      await tx.bitacora.create({ data: { accion, entidad: 'OrdenPago', entidadId: ordenId,
        datosDespues: { solicitudId, referencia: orden.referencia, valor: orden.valor, anticipoSinReembolsoAutomatico: true } } });
      const tesoreria = await tx.usuarioRol.findMany({ where: { rol: 'TESORERIA', usuario: { activo: true } }, select: { usuarioId: true } });
      for (const usuarioId of new Set([solicitud.solicitante.usuarioId, ...tesoreria.map((u) => u.usuarioId)])) {
        await tx.notificacion.create({ data: { usuarioId,
          titulo: vencida ? `Saldo vencido ${orden.referencia}` : `Saldo por vencer ${orden.referencia}`,
          cuerpo: vencida ? 'Se liberó la reserva por saldo impagado. Tesorería debe decidir qué procede con el anticipo; no se reembolsó automáticamente.'
            : `El saldo de ${orden.valor} pesos vence en ${actual.venceEn.toISOString()}.`, enlace: `/solicitudes/${solicitudId}` } });
      }
    });
  }
}
