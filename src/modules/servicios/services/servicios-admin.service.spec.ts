import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ServiciosAdminService } from './servicios-admin.service.js';

const ID = '4d1b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';
const PROVEEDOR = '9a1b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';
const TIPO_A = '11111111-2222-4333-8444-555555555551';
const TIPO_B = '11111111-2222-4333-8444-555555555552';

const fila = (cambios: Record<string, unknown> = {}) => ({
  id: ID,
  proveedorId: PROVEEDOR,
  proveedor: { id: PROVEEDOR, nombre: 'Sonido Putumayo' },
  nombre: 'Sonido profesional',
  categoria: 'TECNICO',
  descripcion: null,
  unidadCobro: 'EVENTO',
  requiereConfirmacion: true,
  anticipacionMinimaDias: 3,
  cantidadMaxima: null,
  activo: true,
  tiposPermitidos: [{ id: TIPO_A, codigo: 'AUDITORIO', nombre: 'Auditorio' }],
  ...cambios,
});

function crearEntorno() {
  const prisma = {
    proveedor: { findUnique: vi.fn().mockResolvedValue({ activo: true }) },
    tipoEspacio: { findMany: vi.fn().mockResolvedValue([{ id: TIPO_A }, { id: TIPO_B }]) },
    servicioComplementario: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([fila()]),
      findUnique: vi.fn().mockResolvedValue(fila()),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(fila()),
      update: vi.fn().mockResolvedValue(fila()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return { servicio: new ServiciosAdminService(prisma as unknown as PrismaService), prisma };
}

const rechazo = (promesa: Promise<unknown>): Promise<unknown> => promesa.catch((e: unknown) => e);

const nuevo = {
  proveedorId: PROVEEDOR,
  nombre: '  Video en vivo ',
  categoria: 'COMUNICACIONES' as const,
  unidadCobro: 'HORA' as const,
};

describe('ServiciosAdminService', () => {
  it('lista con filtros, paginación y los tipos permitidos', async () => {
    const e = crearEntorno();
    const r = await e.servicio.listar({
      activo: false,
      categoria: 'TECNICO',
      proveedorId: PROVEEDOR,
      buscar: ' sonido ',
      pagina: 3,
      porPagina: 5,
    });

    expect(e.prisma.servicioComplementario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          activo: false,
          categoria: 'TECNICO',
          proveedorId: PROVEEDOR,
          nombre: { contains: 'sonido', mode: 'insensitive' },
        },
        skip: 10,
        take: 5,
      }),
    );
    expect(r).toMatchObject({ total: 1, pagina: 3, porPagina: 5 });
    expect(r.datos[0]).toMatchObject({
      proveedor: { id: PROVEEDOR, nombre: 'Sonido Putumayo' },
      tiposPermitidos: [{ id: TIPO_A, codigo: 'AUDITORIO', nombre: 'Auditorio' }],
    });
  });

  it('obtener devuelve el detalle o 404', async () => {
    const e = crearEntorno();
    await expect(e.servicio.obtener(ID)).resolves.toMatchObject({ id: ID });
    e.prisma.servicioComplementario.findUnique.mockResolvedValue(null);
    await expect(rechazo(e.servicio.obtener(ID))).resolves.toMatchObject({ status: 404 });
  });

  it('crea con valores por defecto y conecta los tipos permitidos', async () => {
    const e = crearEntorno();
    await e.servicio.crear({ ...nuevo, tiposPermitidos: [TIPO_A, TIPO_B, TIPO_A] });

    expect(e.prisma.servicioComplementario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          proveedorId: PROVEEDOR,
          nombre: 'Video en vivo',
          categoria: 'COMUNICACIONES',
          descripcion: null,
          unidadCobro: 'HORA',
          requiereConfirmacion: true,
          anticipacionMinimaDias: 3,
          cantidadMaxima: null,
          tiposPermitidos: { connect: [{ id: TIPO_A }, { id: TIPO_B }] },
        },
      }),
    );
  });

  it('sin tiposPermitidos aplica a todos los tipos', async () => {
    const e = crearEntorno();
    await e.servicio.crear(nuevo);
    expect(e.prisma.tipoEspacio.findMany).not.toHaveBeenCalled();
    const { data } = e.prisma.servicioComplementario.create.mock.calls[0]![0] as {
      data: { tiposPermitidos: unknown };
    };
    expect(data.tiposPermitidos).toEqual({ connect: [] });
  });

  it.each([
    ['proveedor inexistente', null, 'NO_ENCONTRADO', 404],
    ['proveedor inactivo', { activo: false }, 'PROVEEDOR_INACTIVO', 422],
  ])('crear con %s da %s', async (_caso, proveedor, codigo, status) => {
    const e = crearEntorno();
    e.prisma.proveedor.findUnique.mockResolvedValue(proveedor);
    const error = await rechazo(e.servicio.crear(nuevo));
    expect(error).toMatchObject({ codigo, status });
    expect(e.prisma.servicioComplementario.create).not.toHaveBeenCalled();
  });

  it('un nombre repetido dentro del proveedor da 409 SERVICIO_DUPLICADO', async () => {
    const e = crearEntorno();
    e.prisma.servicioComplementario.findFirst.mockResolvedValue({ id: 'otro' });
    const error = await rechazo(e.servicio.crear(nuevo));
    expect(error).toMatchObject({ codigo: 'SERVICIO_DUPLICADO', status: 409 });
    expect(e.prisma.servicioComplementario.findFirst).toHaveBeenCalledWith({
      where: { proveedorId: PROVEEDOR, nombre: { equals: 'Video en vivo', mode: 'insensitive' } },
      select: { id: true },
    });
  });

  it('un tipo de espacio inexistente o inactivo da 422 TIPO_ESPACIO_INVALIDO', async () => {
    const e = crearEntorno();
    e.prisma.tipoEspacio.findMany.mockResolvedValue([{ id: TIPO_A }]);
    const error = await rechazo(e.servicio.crear({ ...nuevo, tiposPermitidos: [TIPO_A, TIPO_B] }));
    expect(error).toMatchObject({ codigo: 'TIPO_ESPACIO_INVALIDO', status: 422 });
  });

  it('actualiza solo lo enviado y reemplaza por completo los tipos permitidos', async () => {
    const e = crearEntorno();
    e.prisma.tipoEspacio.findMany.mockResolvedValue([{ id: TIPO_B }]);
    await e.servicio.actualizar(ID, { cantidadMaxima: null, tiposPermitidos: [TIPO_B] });

    expect(e.prisma.servicioComplementario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ID },
        data: { cantidadMaxima: null, tiposPermitidos: { set: [{ id: TIPO_B }] } },
      }),
    );
  });

  it('una lista vacía de tipos deja el servicio disponible para todos', async () => {
    const e = crearEntorno();
    await e.servicio.actualizar(ID, { tiposPermitidos: [] });
    expect(e.prisma.servicioComplementario.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { tiposPermitidos: { set: [] } } }),
    );
  });

  it('cambiar de nombre revalida la unicidad excluyendo el propio servicio', async () => {
    const e = crearEntorno();
    e.prisma.servicioComplementario.findFirst.mockResolvedValue({ id: 'otro' });
    const error = await rechazo(e.servicio.actualizar(ID, { nombre: 'Luces' }));

    expect(error).toMatchObject({ codigo: 'SERVICIO_DUPLICADO' });
    expect(e.prisma.servicioComplementario.findFirst).toHaveBeenCalledWith({
      where: { proveedorId: PROVEEDOR, nombre: { equals: 'Luces', mode: 'insensitive' }, id: { not: ID } },
      select: { id: true },
    });
  });

  it('mover a otro proveedor exige que esté activo', async () => {
    const e = crearEntorno();
    e.prisma.proveedor.findUnique.mockResolvedValue({ activo: false });
    const error = await rechazo(e.servicio.actualizar(ID, { proveedorId: 'otro-proveedor' }));
    expect(error).toMatchObject({ codigo: 'PROVEEDOR_INACTIVO', status: 422 });
  });

  it('reactivar con el proveedor inactivo da 422', async () => {
    const e = crearEntorno();
    e.prisma.proveedor.findUnique.mockResolvedValue({ activo: false });
    const error = await rechazo(e.servicio.actualizar(ID, { activo: true }));
    expect(error).toMatchObject({ codigo: 'PROVEEDOR_INACTIVO' });
  });

  it('actualizar un servicio inexistente da 404', async () => {
    const e = crearEntorno();
    e.prisma.servicioComplementario.findUnique.mockResolvedValue(null);
    await expect(rechazo(e.servicio.actualizar(ID, { descripcion: 'x' }))).resolves.toMatchObject({
      codigo: 'NO_ENCONTRADO',
    });
  });

  it('desactivar marca activo=false y da 404 si no existe', async () => {
    const e = crearEntorno();
    await expect(e.servicio.desactivar(ID)).resolves.toBeUndefined();
    expect(e.prisma.servicioComplementario.updateMany).toHaveBeenCalledWith({
      where: { id: ID },
      data: { activo: false },
    });

    e.prisma.servicioComplementario.updateMany.mockResolvedValue({ count: 0 });
    await expect(rechazo(e.servicio.desactivar(ID))).resolves.toMatchObject({ status: 404 });
  });
});
