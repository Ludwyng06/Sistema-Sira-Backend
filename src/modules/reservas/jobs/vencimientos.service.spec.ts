import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { NotificacionesService } from '../../notificaciones/services/notificaciones.service.js';
import { VencimientosService } from './vencimientos.service.js';

const AHORA = new Date('2026-10-25T15:00:00.000Z');

beforeEach(() => {
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
});

const candidata = (cambios: Record<string, unknown> = {}) => ({
  id: 'sol-1',
  consecutivo: 'SOL-2026-0001',
  estado: 'EN_REVISION',
  reservas: [{ id: 'r-1' }, { id: 'r-2' }],
  ...cambios,
});

function crearEntorno(candidatas: unknown[] = [candidata()]) {
  const tx = {
    solicitud: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    franjaOcupada: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    ordenPago: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    historialEstadoSolicitud: { create: vi.fn().mockResolvedValue({}) },
    bitacora: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    solicitud: { findMany: vi.fn().mockResolvedValue(candidatas) },
    ordenPago: {
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn((fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const notificaciones = { notificarSolicitante: vi.fn().mockResolvedValue(undefined) };
  const servicio = new VencimientosService(
    prisma as unknown as PrismaService,
    notificaciones as unknown as NotificacionesService,
  );
  return { servicio, prisma, tx, notificaciones };
}

describe('VencimientosService.ejecutar', () => {
  it('busca solo estados con plazo y fecha vencida', async () => {
    const e = crearEntorno([]);
    await e.servicio.ejecutar(AHORA);
    expect(e.prisma.solicitud.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          estado: { in: ['ENVIADA', 'EN_REVISION', 'COTIZADA', 'PAGO_PENDIENTE'] },
          venceEn: { lte: AHORA },
        },
      }),
    );
  });

  it('vence la solicitud: libera franjas, anula órdenes pendientes, deja historial y bitácora y notifica', async () => {
    const e = crearEntorno();
    const r = await e.servicio.ejecutar(AHORA);

    expect(r.solicitudes).toBe(1);
    expect(e.tx.solicitud.updateMany).toHaveBeenCalledWith({
      where: { id: 'sol-1', estado: 'EN_REVISION' },
      data: { estado: 'VENCIDA', venceEn: null },
    });
    expect(e.tx.franjaOcupada.updateMany).toHaveBeenCalledWith({
      where: { reservaItemId: { in: ['r-1', 'r-2'] }, estado: { not: 'LIBERADA' } },
      data: { estado: 'LIBERADA', retenidaHasta: null },
    });
    expect(e.tx.ordenPago.updateMany).toHaveBeenCalledWith({
      where: { estado: 'PENDIENTE', cotizacion: { solicitudId: 'sol-1' } },
      data: { estado: 'VENCIDA' },
    });
    expect(e.tx.historialEstadoSolicitud.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ estadoAnterior: 'EN_REVISION', estadoNuevo: 'VENCIDA', usuarioId: null }),
    });
    expect(e.tx.bitacora.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ accion: 'SOLICITUD_VENCIDA', usuarioId: null, entidadId: 'sol-1' }),
    });
    expect(e.notificaciones.notificarSolicitante).toHaveBeenCalledWith(
      'sol-1',
      expect.objectContaining({ titulo: 'Tu solicitud SOL-2026-0001 venció' }),
    );
  });

  it('una solicitud con una orden en verificación no vence (RN-02)', async () => {
    const e = crearEntorno([candidata({ estado: 'PAGO_PENDIENTE' })]);
    e.prisma.ordenPago.count.mockResolvedValue(1);
    const r = await e.servicio.ejecutar(AHORA);

    expect(r.solicitudes).toBe(0);
    expect(e.prisma.$transaction).not.toHaveBeenCalled();
    expect(e.notificaciones.notificarSolicitante).not.toHaveBeenCalled();
  });

  it('una solicitud en PAGO_PENDIENTE sin orden en verificación sí vence', async () => {
    const e = crearEntorno([candidata({ estado: 'PAGO_PENDIENTE' })]);
    const r = await e.servicio.ejecutar(AHORA);
    expect(r.solicitudes).toBe(1);
    expect(e.prisma.ordenPago.count).toHaveBeenCalledWith({
      where: { estado: 'EN_VERIFICACION', cotizacion: { solicitudId: 'sol-1' } },
    });
  });

  it('si otra operación cambió el estado a la vez (count 0) no hace nada más', async () => {
    const e = crearEntorno();
    e.tx.solicitud.updateMany.mockResolvedValue({ count: 0 });
    const r = await e.servicio.ejecutar(AHORA);

    expect(r.solicitudes).toBe(0);
    expect(e.tx.franjaOcupada.updateMany).not.toHaveBeenCalled();
    expect(e.notificaciones.notificarSolicitante).not.toHaveBeenCalled();
  });

  it('un error en una solicitud no detiene a las demás', async () => {
    const e = crearEntorno([candidata({ id: 'sol-1' }), candidata({ id: 'sol-2' })]);
    e.prisma.$transaction.mockRejectedValueOnce(new Error('bloqueo de base de datos'));
    const r = await e.servicio.ejecutar(AHORA);
    expect(r.solicitudes).toBe(1);
  });

  it('marca como vencidas las órdenes pendientes cuyo plazo terminó', async () => {
    const e = crearEntorno([]);
    e.prisma.ordenPago.updateMany.mockResolvedValue({ count: 3 });
    const r = await e.servicio.ejecutar(AHORA);

    expect(r.ordenes).toBe(3);
    expect(e.prisma.ordenPago.updateMany).toHaveBeenCalledWith({
      where: { estado: 'PENDIENTE', venceEn: { lte: AHORA } },
      data: { estado: 'VENCIDA' },
    });
  });
});

describe('VencimientosService.programado', () => {
  it('no se solapa consigo mismo y no propaga errores', async () => {
    const e = crearEntorno([]);
    let liberar: () => void = () => undefined;
    e.prisma.solicitud.findMany.mockImplementation(
      () => new Promise((resolver) => (liberar = () => resolver([]))),
    );
    const primera = e.servicio.programado();
    await e.servicio.programado();
    expect(e.prisma.solicitud.findMany).toHaveBeenCalledTimes(1);
    liberar();
    await primera;

    e.prisma.solicitud.findMany.mockRejectedValueOnce(new Error('sin base de datos'));
    await expect(e.servicio.programado()).resolves.toBeUndefined();
  });
});
