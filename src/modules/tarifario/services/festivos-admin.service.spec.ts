import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { FestivosAdminService } from './festivos-admin.service.js';

function crearEntorno() {
  const prisma = {
    festivo: {
      findMany: vi.fn().mockResolvedValue([
        { fecha: new Date('2026-01-01T00:00:00.000Z'), nombre: 'Año Nuevo' },
        { fecha: new Date('2026-12-08T00:00:00.000Z'), nombre: 'Inmaculada Concepción' },
      ]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn((args: { data: { fecha: Date; nombre: string } }) => Promise.resolve(args.data)),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return { servicio: new FestivosAdminService(prisma as unknown as PrismaService), prisma };
}

const rechazo = (promesa: Promise<unknown>): Promise<unknown> => promesa.catch((e: unknown) => e);

describe('FestivosAdminService', () => {
  it('lista los festivos del año pedido', async () => {
    const e = crearEntorno();
    const r = await e.servicio.listar(2026);

    expect(e.prisma.festivo.findMany).toHaveBeenCalledWith({
      where: {
        fecha: { gte: new Date('2026-01-01T00:00:00.000Z'), lte: new Date('2026-12-31T00:00:00.000Z') },
      },
      orderBy: { fecha: 'asc' },
    });
    expect(r).toEqual([
      { id: '2026-01-01', fecha: '2026-01-01', nombre: 'Año Nuevo' },
      { id: '2026-12-08', fecha: '2026-12-08', nombre: 'Inmaculada Concepción' },
    ]);
  });

  it('sin año usa el año en curso', async () => {
    const e = crearEntorno();
    await e.servicio.listar();
    const { where } = e.prisma.festivo.findMany.mock.calls[0]![0] as {
      where: { fecha: { gte: Date } };
    };
    expect(where.fecha.gte.toISOString().slice(5)).toBe('01-01T00:00:00.000Z');
  });

  it('crea un festivo con el nombre recortado', async () => {
    const e = crearEntorno();
    const r = await e.servicio.crear({ fecha: '2026-12-25', nombre: ' Navidad ' });
    expect(e.prisma.festivo.create).toHaveBeenCalledWith({
      data: { fecha: new Date('2026-12-25T00:00:00.000Z'), nombre: 'Navidad' },
    });
    expect(r).toEqual({ id: '2026-12-25', fecha: '2026-12-25', nombre: 'Navidad' });
  });

  it('una fecha ya registrada responde 409 FESTIVO_EXISTENTE', async () => {
    const e = crearEntorno();
    e.prisma.festivo.findUnique.mockResolvedValue({ fecha: new Date('2026-12-25T00:00:00.000Z') });
    const error = await rechazo(e.servicio.crear({ fecha: '2026-12-25', nombre: 'Navidad' }));
    expect(error).toMatchObject({ codigo: 'FESTIVO_EXISTENTE', status: 409 });
    expect(e.prisma.festivo.create).not.toHaveBeenCalled();
  });

  it('una fecha imposible responde 400 FECHA_INVALIDA', async () => {
    const e = crearEntorno();
    const error = await rechazo(e.servicio.crear({ fecha: '2026-02-30', nombre: 'Falso' }));
    expect(error).toMatchObject({ codigo: 'FECHA_INVALIDA', status: 400 });
  });

  it('elimina el festivo por su fecha', async () => {
    const e = crearEntorno();
    await expect(e.servicio.eliminar('2026-12-25')).resolves.toBeUndefined();
    expect(e.prisma.festivo.deleteMany).toHaveBeenCalledWith({
      where: { fecha: new Date('2026-12-25T00:00:00.000Z') },
    });
  });

  it('eliminar un festivo que no existe o con id inválido responde 404', async () => {
    const e = crearEntorno();
    e.prisma.festivo.deleteMany.mockResolvedValue({ count: 0 });
    await expect(rechazo(e.servicio.eliminar('2026-12-26'))).resolves.toMatchObject({
      codigo: 'NO_ENCONTRADO',
      status: 404,
    });
    await expect(rechazo(e.servicio.eliminar('no-es-fecha'))).resolves.toMatchObject({ status: 404 });
  });
});
