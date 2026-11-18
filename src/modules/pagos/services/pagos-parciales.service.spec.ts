import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { ParametroService } from '../../../shared/parametros/parametro.service.js';
import type { ConsecutivoService } from '../../../shared/consecutivos/consecutivo.service.js';
import { PagosParcialesService } from './pagos-parciales.service.js';

const ahora = new Date('2026-11-13T12:00:00Z');
function entorno(estado = 'PENDIENTE', venceEn = new Date(ahora.getTime() - 1)) {
  const orden = { id: 'saldo-1', cotizacionId: 'cot-1', tipo: 'SALDO', estado, referencia: 'OP-SALDO', valor: 50, venceEn };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    solicitud: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), update: vi.fn().mockResolvedValue({}),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'sol-1', estado: 'CONFIRMADA', solicitante: { usuarioId: 'dueno' }, reservas: [{ id: 'r-1' }] }) },
    ordenPago: { findUniqueOrThrow: vi.fn().mockResolvedValue(orden), count: vi.fn().mockResolvedValue(['APROBADA', 'EN_VERIFICACION'].includes(estado) ? 1 : 0),
      findFirst: vi.fn().mockResolvedValue(null), updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'saldo-1', ...data })) },
    cotizacion: { findUniqueOrThrow: vi.fn().mockResolvedValue({ total: 101, depositoGarantia: 0, solicitudId: 'sol-1', solicitud: { solicitante: { usuarioId: 'dueno' } } }) },
    bitacora: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
    franjaOcupada: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, historialEstadoSolicitud: { create: vi.fn().mockResolvedValue({}) },
    usuarioRol: { findMany: vi.fn().mockResolvedValue([{ usuarioId: 'tesoreria' }]) }, notificacion: { create: vi.fn().mockResolvedValue({}) },
    reembolso: { create: vi.fn() },
  };
  const prisma = { reservaItem: { findFirst: vi.fn().mockResolvedValue({ inicio: new Date(Date.now() + 30 * 86400_000) }) },
    $transaction: vi.fn(async (fn: (cliente: typeof tx) => Promise<void>) => fn(tx)) };
  const parametros = { obtenerNumero: vi.fn(async (_clave: string, defecto: number) => defecto) };
  const consecutivos = { siguiente: vi.fn().mockResolvedValue('OP-SALDO') };
  const servicio = new PagosParcialesService(prisma as unknown as PrismaService, parametros as unknown as ParametroService, consecutivos as unknown as ConsecutivoService);
  return { servicio, tx, prisma, parametros };
}
describe('PagosParcialesService', () => {
  it('por defecto cobra TOTAL sin buscar plazo de saldo', async () => {
    const e = entorno();
    await expect(e.servicio.planInicial(101, 'sol-1')).resolves.toEqual({ tipo: 'TOTAL', anticipo: 101, saldo: 0, saldoVenceEn: null });
    expect(e.prisma.reservaItem.findFirst).not.toHaveBeenCalled();
  });
  it('crea el saldo exacto con fecha congelada, independiente del parámetro actual', async () => {
    const e = entorno(); e.tx.bitacora.findFirst.mockResolvedValue({ datosDespues: { saldoVenceEn: '2026-12-01T12:00:00Z' } });
    const saldo = await e.servicio.asegurarSaldo(e.tx as unknown as Prisma.TransactionClient, { id: 'anticipo-1', cotizacionId: 'cot-1', valor: 51 });
    expect(saldo).toMatchObject({ tipo: 'SALDO', valor: 50, medio: 'CONSIGNACION', venceEn: new Date('2026-12-01T12:00:00Z') });
    expect(e.parametros.obtenerNumero).not.toHaveBeenCalled();
  });
  it('un saldo ya creado se reutiliza sin duplicar cobros o avisos', async () => {
    const e = entorno(); e.tx.ordenPago.findFirst.mockResolvedValue({ id: 'saldo-existente' });
    await expect(e.servicio.asegurarSaldo(e.tx as unknown as Prisma.TransactionClient, { id: 'a', cotizacionId: 'c', valor: 51 })).resolves.toMatchObject({ id: 'saldo-existente' });
    expect(e.tx.ordenPago.create).not.toHaveBeenCalled(); expect(e.tx.notificacion.create).not.toHaveBeenCalled();
  });
  it.each(['APROBADA', 'EN_VERIFICACION'])('no vence ni avisa si existe saldo %s', async (estado) => {
    const e = entorno(estado); await e.servicio.revisarUna('saldo-1', 'sol-1', ahora);
    expect(e.tx.solicitud.update).not.toHaveBeenCalled(); expect(e.tx.franjaOcupada.updateMany).not.toHaveBeenCalled();
    expect(e.tx.notificacion.create).not.toHaveBeenCalled();
    expect(e.tx.ordenPago.count).toHaveBeenCalledWith({ where: { cotizacionId: 'cot-1', tipo: 'SALDO', estado: { in: ['APROBADA', 'EN_VERIFICACION'] } } });
  });
  it('saldo vencido libera, registra y alerta a ambos sin reembolsar anticipo', async () => {
    const e = entorno(); await e.servicio.revisarUna('saldo-1', 'sol-1', ahora);
    expect(e.tx.solicitud.update).toHaveBeenCalledWith({ where: { id: 'sol-1' }, data: { estado: 'VENCIDA', venceEn: null } });
    expect(e.tx.franjaOcupada.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { estado: 'LIBERADA', retenidaHasta: null } }));
    expect(e.tx.notificacion.create).toHaveBeenCalledTimes(2); expect(e.tx.reembolso.create).not.toHaveBeenCalled();
  });
  it('avisa 24 horas antes sin liberar la reserva', async () => {
    const e = entorno('PENDIENTE', new Date(ahora.getTime() + 23 * 3600_000)); await e.servicio.revisarUna('saldo-1', 'sol-1', ahora);
    expect(e.tx.solicitud.update).not.toHaveBeenCalled(); expect(e.tx.notificacion.create).toHaveBeenCalledTimes(2);
    expect(e.tx.bitacora.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ accion: 'SALDO_POR_VENCER' }) }));
  });
});
