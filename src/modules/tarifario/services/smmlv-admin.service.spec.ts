import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { SmmlvAdminService } from './smmlv-admin.service.js';

describe('SmmlvAdminService', () => {
  it('lista los valores de SMMLV ordenados por año descendente', async () => {
    const prisma = {
      smmlv: {
        findMany: vi.fn().mockResolvedValue([
          { anio: 2026, valor: 1_423_500 },
          { anio: 2025, valor: 1_300_000 },
        ]),
      },
    };
    const servicio = new SmmlvAdminService(prisma as unknown as PrismaService);
    await expect(servicio.listar()).resolves.toEqual([
      { anio: 2026, valor: 1_423_500 },
      { anio: 2025, valor: 1_300_000 },
    ]);
  });

  it('guarda el SMMLV de un año y recalcula las tarifas indexadas en SMMLV de ese año (RN-06)', async () => {
    const tx = {
      smmlv: {
        upsert: vi.fn().mockResolvedValue({ anio: 2026, valor: 1_500_000 }),
      },
      tarifa: {
        findMany: vi.fn().mockResolvedValue([
          { id: 't-1', valorEnSmmlv: { toString: () => '0.1' } },
          { id: 't-2', valorEnSmmlv: { toString: () => '0.25' } },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: vi.fn((fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const servicio = new SmmlvAdminService(prisma as unknown as PrismaService);
    const resultado = await servicio.guardar(2026, { valor: 1_500_000 });

    expect(resultado).toEqual({
      anio: 2026,
      valor: 1_500_000,
      tarifasRecalculadas: 2,
    });
    expect(tx.tarifa.update).toHaveBeenCalledWith({
      where: { id: 't-1' },
      data: { valor: 150_000 },
    });
    expect(tx.tarifa.update).toHaveBeenCalledWith({
      where: { id: 't-2' },
      data: { valor: 375_000 },
    });
  });
});
