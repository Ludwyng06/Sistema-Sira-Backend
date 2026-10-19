import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { RecargosAdminService } from './recargos-admin.service.js';

const decimal = (valor: number) => ({ toString: () => String(valor) });

const fila = (cambios: Record<string, unknown> = {}) => ({
  id: 'r-1',
  tipo: 'NOCTURNO',
  porcentaje: decimal(20),
  desdeHora: '18:00',
  activo: true,
  ...cambios,
});

function crearEntorno(existente: unknown = fila()) {
  const prisma = {
    recargo: {
      findMany: vi.fn().mockResolvedValue([fila(), fila({ id: 'r-2', tipo: 'DOMINICAL', desdeHora: null })]),
      findUnique: vi.fn().mockResolvedValue(existente),
      update: vi.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(fila({ ...args.data, porcentaje: decimal(Number(args.data.porcentaje ?? 20)) })),
      ),
      create: vi.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(fila({ ...args.data, porcentaje: decimal(Number(args.data.porcentaje)) })),
      ),
    },
  };
  return { servicio: new RecargosAdminService(prisma as unknown as PrismaService), prisma };
}

const rechazo = (promesa: Promise<unknown>): Promise<unknown> => promesa.catch((e: unknown) => e);

describe('RecargosAdminService', () => {
  it('lista los recargos con el porcentaje como número', async () => {
    const e = crearEntorno();
    const r = await e.servicio.listar();
    expect(e.prisma.recargo.findMany).toHaveBeenCalledWith({ orderBy: { tipo: 'asc' } });
    expect(r[0]).toEqual({ id: 'r-1', tipo: 'NOCTURNO', porcentaje: 20, desdeHora: '18:00', activo: true });
    expect(r[1]).toMatchObject({ tipo: 'DOMINICAL', desdeHora: null });
  });

  it('actualiza solo los campos enviados', async () => {
    const e = crearEntorno();
    const r = await e.servicio.actualizar('NOCTURNO', { porcentaje: 25, desdeHora: '19:00' });
    expect(e.prisma.recargo.update).toHaveBeenCalledWith({
      where: { tipo: 'NOCTURNO' },
      data: { porcentaje: 25, desdeHora: '19:00' },
    });
    expect(r).toMatchObject({ porcentaje: 25, desdeHora: '19:00' });
  });

  it('puede desactivar un recargo', async () => {
    const e = crearEntorno(fila({ tipo: 'FESTIVO', desdeHora: null }));
    await e.servicio.actualizar('FESTIVO', { activo: false });
    expect(e.prisma.recargo.update).toHaveBeenCalledWith({
      where: { tipo: 'FESTIVO' },
      data: { activo: false },
    });
  });

  it('la hora de inicio solo aplica al nocturno: 422 RECARGO_INVALIDO', async () => {
    const e = crearEntorno();
    const error = await rechazo(e.servicio.actualizar('DOMINICAL', { desdeHora: '18:00' }));
    expect(error).toMatchObject({ codigo: 'RECARGO_INVALIDO', status: 422 });
    expect(e.prisma.recargo.update).not.toHaveBeenCalled();
  });

  it('sin campos responde 422 SIN_CAMBIOS', async () => {
    const e = crearEntorno();
    const error = await rechazo(e.servicio.actualizar('NOCTURNO', {}));
    expect(error).toMatchObject({ codigo: 'SIN_CAMBIOS', status: 422 });
  });

  it('si no está configurado exige el porcentaje y lo crea', async () => {
    const e = crearEntorno(null);
    const sinPorcentaje = await rechazo(e.servicio.actualizar('FESTIVO', { activo: true }));
    expect(sinPorcentaje).toMatchObject({ codigo: 'RECARGO_INVALIDO', status: 422 });

    await e.servicio.actualizar('NOCTURNO', { porcentaje: 20 });
    expect(e.prisma.recargo.create).toHaveBeenCalledWith({
      data: { tipo: 'NOCTURNO', porcentaje: 20, desdeHora: '18:00', activo: true },
    });

    await e.servicio.actualizar('DOMINICAL', { porcentaje: 25, activo: false });
    expect(e.prisma.recargo.create).toHaveBeenLastCalledWith({
      data: { tipo: 'DOMINICAL', porcentaje: 25, desdeHora: null, activo: false },
    });
  });
});
