import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ServiciosService } from './servicios.service.js';

function crearEntorno(filas: unknown[] = []) {
  const prisma = { servicioComplementario: { findMany: vi.fn().mockResolvedValue(filas) } };
  return { servicio: new ServiciosService(prisma as unknown as PrismaService), prisma };
}

describe('ServiciosService.listar', () => {
  it('lista solo activos con proveedor activo y selecciona campos públicos', async () => {
    const fila = {
      id: 's1',
      nombre: 'Sonido',
      categoria: 'TECNICO',
      descripcion: null,
      unidadCobro: 'EVENTO',
      requiereConfirmacion: true,
      anticipacionMinimaDias: 3,
      cantidadMaxima: null,
    };
    const { servicio, prisma } = crearEntorno([fila]);
    await expect(servicio.listar()).resolves.toEqual([fila]);

    const args = prisma.servicioComplementario.findMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
      select: Record<string, boolean>;
    };
    expect(args.where).toEqual({ activo: true, proveedor: { activo: true } });
    expect(args.select).not.toHaveProperty('proveedor');
    expect(args.select).not.toHaveProperty('proveedorId');
  });

  it('filtra por tipo de espacio incluyendo los servicios sin restricción', async () => {
    const { servicio, prisma } = crearEntorno();
    await servicio.listar('tipo-1');
    const { where } = prisma.servicioComplementario.findMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
    };
    expect(where).toMatchObject({
      OR: [{ tiposPermitidos: { none: {} } }, { tiposPermitidos: { some: { id: 'tipo-1' } } }],
    });
  });
});
