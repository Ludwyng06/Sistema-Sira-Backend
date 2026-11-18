import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ProveedoresAdminService } from './proveedores-admin.service.js';

const ID = '4d1b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';

const fila = (cambios: Record<string, unknown> = {}) => ({
  id: ID,
  tipo: 'EXTERNO',
  nombre: 'Sonido Putumayo',
  documento: '900.123.456-7',
  contactoNombre: 'Luis',
  contactoCorreo: 'ventas@sonido.co',
  contactoTelefono: '3001234567',
  porcentajeAdministracion: { toString: () => '10' },
  activo: true,
  _count: { servicios: 2 },
  ...cambios,
});

function crearEntorno() {
  const tx = {
    servicioComplementario: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    proveedor: { update: vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve(fila(args.data))) },
  };
  const prisma = {
    proveedor: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([fila()]),
      findUnique: vi.fn().mockResolvedValue(fila()),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve(fila(args.data))),
    },
    $transaction: vi.fn((fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { servicio: new ProveedoresAdminService(prisma as unknown as PrismaService), prisma, tx };
}

const rechazo = (promesa: Promise<unknown>): Promise<unknown> => promesa.catch((e: unknown) => e);

describe('ProveedoresAdminService', () => {
  it('lista paginada con filtros y conteo de servicios activos', async () => {
    const e = crearEntorno();
    const r = await e.servicio.listar({ activo: true, tipo: 'EXTERNO', buscar: ' sonido ', pagina: 2, porPagina: 10 });

    expect(e.prisma.proveedor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { activo: true, tipo: 'EXTERNO', nombre: { contains: 'sonido', mode: 'insensitive' } },
        orderBy: { nombre: 'asc' },
        skip: 10,
        take: 10,
      }),
    );
    expect(r).toMatchObject({ total: 1, pagina: 2, porPagina: 10 });
    expect(r.datos[0]).toMatchObject({
      nombre: 'Sonido Putumayo',
      contactoCorreo: 'ventas@sonido.co',
      porcentajeAdministracion: 10,
      serviciosActivos: 2,
    });
  });

  it('obtener devuelve el detalle o 404', async () => {
    const e = crearEntorno();
    await expect(e.servicio.obtener(ID)).resolves.toMatchObject({ id: ID });
    e.prisma.proveedor.findUnique.mockResolvedValue(null);
    await expect(rechazo(e.servicio.obtener(ID))).resolves.toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
  });

  it('crea normalizando textos y con porcentaje 0 por defecto', async () => {
    const e = crearEntorno();
    await e.servicio.crear({
      tipo: 'EXTERNO',
      nombre: '  Luces del Sur  ',
      contactoCorreo: ' VENTAS@Luces.co ',
    });
    expect(e.prisma.proveedor.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          tipo: 'EXTERNO',
          nombre: 'Luces del Sur',
          documento: null,
          contactoNombre: null,
          contactoCorreo: 'ventas@luces.co',
          contactoTelefono: null,
          porcentajeAdministracion: 0,
        },
      }),
    );
  });

  it('un nombre repetido (sin importar mayúsculas) da 409 PROVEEDOR_DUPLICADO', async () => {
    const e = crearEntorno();
    e.prisma.proveedor.findFirst.mockResolvedValue({ id: 'otro' });
    const error = await rechazo(e.servicio.crear({ tipo: 'INTERNO', nombre: 'SONIDO putumayo' }));

    expect(error).toMatchObject({ codigo: 'PROVEEDOR_DUPLICADO', status: 409 });
    expect(e.prisma.proveedor.findFirst).toHaveBeenCalledWith({
      where: { nombre: { equals: 'SONIDO putumayo', mode: 'insensitive' } },
      select: { id: true },
    });
    expect(e.prisma.proveedor.create).not.toHaveBeenCalled();
  });

  it('actualiza solo los campos enviados y no revalida el nombre si no cambió', async () => {
    const e = crearEntorno();
    await e.servicio.actualizar(ID, { nombre: 'sonido putumayo', porcentajeAdministracion: 15 });
    expect(e.prisma.proveedor.findFirst).not.toHaveBeenCalled();
    expect(e.tx.proveedor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ID },
        data: { nombre: 'sonido putumayo', porcentajeAdministracion: 15 },
      }),
    );
    expect(e.tx.servicioComplementario.updateMany).not.toHaveBeenCalled();
  });

  it('cambiar el nombre a uno ya usado por otro da 409', async () => {
    const e = crearEntorno();
    e.prisma.proveedor.findFirst.mockResolvedValue({ id: 'otro' });
    const error = await rechazo(e.servicio.actualizar(ID, { nombre: 'Luces del Sur' }));
    expect(error).toMatchObject({ codigo: 'PROVEEDOR_DUPLICADO', status: 409 });
    expect(e.prisma.proveedor.findFirst).toHaveBeenCalledWith({
      where: { nombre: { equals: 'Luces del Sur', mode: 'insensitive' }, id: { not: ID } },
      select: { id: true },
    });
  });

  it('activo=false desactiva también sus servicios en la misma transacción', async () => {
    const e = crearEntorno();
    await e.servicio.actualizar(ID, { activo: false });
    expect(e.prisma.$transaction).toHaveBeenCalledOnce();
    expect(e.tx.servicioComplementario.updateMany).toHaveBeenCalledWith({
      where: { proveedorId: ID },
      data: { activo: false },
    });
  });

  it('activo=true reactiva al proveedor sin tocar sus servicios', async () => {
    const e = crearEntorno();
    await e.servicio.actualizar(ID, { activo: true });
    expect(e.tx.servicioComplementario.updateMany).not.toHaveBeenCalled();
    expect(e.tx.proveedor.update).toHaveBeenCalledWith(expect.objectContaining({ data: { activo: true } }));
  });

  it('actualizar un proveedor inexistente da 404', async () => {
    const e = crearEntorno();
    e.prisma.proveedor.findUnique.mockResolvedValue(null);
    await expect(rechazo(e.servicio.actualizar(ID, { tipo: 'INTERNO' }))).resolves.toMatchObject({
      codigo: 'NO_ENCONTRADO',
    });
  });

  it('desactivar apaga al proveedor y a sus servicios; inexistente da 404', async () => {
    const e = crearEntorno();
    await expect(e.servicio.desactivar(ID)).resolves.toBeUndefined();
    expect(e.tx.servicioComplementario.updateMany).toHaveBeenCalledWith({
      where: { proveedorId: ID },
      data: { activo: false },
    });
    expect(e.tx.proveedor.update).toHaveBeenCalledWith({ where: { id: ID }, data: { activo: false } });

    e.prisma.proveedor.findUnique.mockResolvedValue(null);
    await expect(rechazo(e.servicio.desactivar(ID))).resolves.toMatchObject({ status: 404 });
  });
});
