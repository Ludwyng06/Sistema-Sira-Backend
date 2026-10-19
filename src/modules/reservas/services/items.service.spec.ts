import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { TarifarioService } from '../../tarifario/services/tarifario.service.js';
import { ItemsService } from './items.service.js';
import type { SolicitudesService } from './solicitudes.service.js';

const SOLICITUD_ID = '6e1d8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';
const ESPACIO_ID = '8a3b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';
const SERVICIO_ID = '4d1b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';
const AHORA = new Date('2026-10-21T15:00:00.000Z');

const usuario: UsuarioAutenticado = {
  id: 'u-1',
  correo: 'ana@itp.edu.co',
  roles: ['SOLICITANTE'],
  dependencias: [],
  correoVerificado: true,
  esInstitucional: true,
};

const estimado = {
  espacioId: ESPACIO_ID,
  tipoSolicitante: 'INTERNO',
  lineas: [
    { fecha: '2026-11-03', horas: 4, unidad: 'HORA', cantidad: 4, base: 80_000, recargos: [], subtotal: 80_000 },
  ],
  base: 80_000,
  recargos: 0,
  subtotal: 80_000,
  iva: 0,
  total: 80_000,
};

function crearEntorno() {
  const prisma = {
    $transaction: vi.fn(),
    solicitud: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    espacio: { findFirst: vi.fn().mockResolvedValue({ id: ESPACIO_ID }) },
    reservaItem: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'r-1', ...args.data, cantidad: { toString: () => String(args.data.cantidad) } }),
      ),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    servicioComplementario: {
      findFirst: vi.fn().mockResolvedValue({ id: SERVICIO_ID, nombre: 'Sonido', cantidadMaxima: 2 }),
    },
    servicioItem: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 's-1', estadoConfirmacion: 'PENDIENTE', ...args.data }),
      ),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    tarifa: { findFirst: vi.fn().mockResolvedValue({ valor: 150_000 }) },
  };
  prisma.$transaction.mockImplementation((fn: (cliente: typeof prisma) => unknown) => fn(prisma));
  const solicitudes = {
    borradorPropio: vi.fn().mockResolvedValue({ id: SOLICITUD_ID, tipoTarifa: 'INTERNO' }),
  };
  const tarifario = { calcular: vi.fn().mockResolvedValue(estimado) };
  const servicio = new ItemsService(
    prisma as unknown as PrismaService,
    solicitudes as unknown as SolicitudesService,
    tarifario as unknown as TarifarioService,
  );
  return { servicio, prisma, solicitudes, tarifario };
}

const rechazo = (promesa: Promise<unknown>): Promise<unknown> => promesa.catch((e: unknown) => e);
const reserva = (cambios: Record<string, string> = {}) => ({
  espacioId: ESPACIO_ID,
  inicio: '2026-11-03T13:00:00.000Z',
  fin: '2026-11-03T17:00:00.000Z',
  ...cambios,
});

describe('ItemsService reservas', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AHORA);
  });
  afterEach(() => vi.useRealTimers());

  it('agrega la reserva con el valor estimado por el tarifario', async () => {
    const e = crearEntorno();
    const item = await e.servicio.agregarReserva(SOLICITUD_ID, reserva(), usuario);

    expect(e.solicitudes.borradorPropio).toHaveBeenCalledWith(SOLICITUD_ID, usuario);
    expect(e.tarifario.calcular).toHaveBeenCalledWith(
      expect.objectContaining({ espacioId: ESPACIO_ID, tipoSolicitante: 'INTERNO' }),
      expect.any(Date),
    );
    expect(item).toMatchObject({
      id: 'r-1',
      espacioId: ESPACIO_ID,
      inicio: '2026-11-03T13:00:00.000Z',
      fin: '2026-11-03T17:00:00.000Z',
      unidad: 'HORA',
      cantidad: 4,
      valorUnitario: 20_000,
      recargos: 0,
      subtotal: 80_000,
    });
  });

  it.each([
    ['fin anterior al inicio', { fin: '2026-11-03T12:00:00.000Z' }],
    ['cruza la medianoche', { fin: '2026-11-04T06:00:00.000Z' }],
    ['inicio en el pasado', { inicio: '2026-10-20T13:00:00.000Z', fin: '2026-10-20T15:00:00.000Z' }],
  ])('rechaza una reserva que %s', async (_caso, cambios) => {
    const e = crearEntorno();
    const error = await rechazo(e.servicio.agregarReserva(SOLICITUD_ID, reserva(cambios), usuario));
    expect(error).toMatchObject({ codigo: 'RANGO_INVALIDO', status: 400 });
    expect(e.prisma.reservaItem.create).not.toHaveBeenCalled();
  });

  it('un espacio inexistente o fuera de servicio da 404', async () => {
    const e = crearEntorno();
    e.prisma.espacio.findFirst.mockResolvedValue(null);
    const error = await rechazo(e.servicio.agregarReserva(SOLICITUD_ID, reserva(), usuario));
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
  });

  it('un horario que se cruza en el mismo espacio da 409 RESERVA_DUPLICADA', async () => {
    const e = crearEntorno();
    e.prisma.reservaItem.findMany.mockResolvedValue([
      {
        espacioId: ESPACIO_ID,
        inicio: new Date('2026-11-03T15:00:00.000Z'),
        fin: new Date('2026-11-03T18:00:00.000Z'),
      },
    ]);
    const error = await rechazo(e.servicio.agregarReserva(SOLICITUD_ID, reserva(), usuario));
    expect(error).toMatchObject({ codigo: 'RESERVA_DUPLICADA', status: 409 });
  });

  it('el mismo espacio en un horario contiguo sí se admite', async () => {
    const e = crearEntorno();
    e.prisma.reservaItem.findMany.mockResolvedValue([
      {
        espacioId: ESPACIO_ID,
        inicio: new Date('2026-11-03T17:00:00.000Z'),
        fin: new Date('2026-11-03T19:00:00.000Z'),
      },
    ]);
    await expect(e.servicio.agregarReserva(SOLICITUD_ID, reserva(), usuario)).resolves.toMatchObject({
      id: 'r-1',
    });
  });

  it('propaga el error de tarifa no definida', async () => {
    const e = crearEntorno();
    e.tarifario.calcular.mockRejectedValue(new ErrorDominio('TARIFA_NO_DEFINIDA', 'x', 422));
    const error = await rechazo(e.servicio.agregarReserva(SOLICITUD_ID, reserva(), usuario));
    expect(error).toMatchObject({ codigo: 'TARIFA_NO_DEFINIDA' });
  });

  it('quitarReserva exige borrador propio y responde 404 si no existe el ítem', async () => {
    const e = crearEntorno();
    await expect(e.servicio.quitarReserva(SOLICITUD_ID, 'r-1', usuario)).resolves.toBeUndefined();
    e.prisma.reservaItem.deleteMany.mockResolvedValue({ count: 0 });
    const error = await rechazo(e.servicio.quitarReserva(SOLICITUD_ID, 'r-9', usuario));
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
    expect(e.prisma.reservaItem.deleteMany).toHaveBeenLastCalledWith({
      where: { id: 'r-9', solicitudId: SOLICITUD_ID },
    });
  });
});

describe('ItemsService concurrencia con el envío', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AHORA);
  });
  afterEach(() => vi.useRealTimers());

  it('una reserva agregada cuando la solicitud ya salió de BORRADOR da 409 y no se crea', async () => {
    const e = crearEntorno();
    e.prisma.solicitud.updateMany.mockResolvedValue({ count: 0 });
    const error = await rechazo(e.servicio.agregarReserva(SOLICITUD_ID, reserva(), usuario));
    expect(error).toMatchObject({ codigo: 'SOLICITUD_NO_EDITABLE', status: 409 });
    expect(e.prisma.reservaItem.create).not.toHaveBeenCalled();
    expect(e.prisma.solicitud.updateMany).toHaveBeenCalledWith({
      where: { id: SOLICITUD_ID, estado: 'BORRADOR' },
      data: { actualizadoEn: expect.any(Date) },
    });
  });

  it('un servicio agregado cuando la solicitud ya salió de BORRADOR da 409 y no se crea', async () => {
    const e = crearEntorno();
    e.prisma.solicitud.updateMany.mockResolvedValue({ count: 0 });
    const error = await rechazo(
      e.servicio.agregarServicio(SOLICITUD_ID, { servicioId: SERVICIO_ID, cantidad: 1 }, usuario),
    );
    expect(error).toMatchObject({ codigo: 'SOLICITUD_NO_EDITABLE', status: 409 });
    expect(e.prisma.servicioItem.create).not.toHaveBeenCalled();
  });

  it('quitar un ítem cuando la solicitud ya no es borrador da 409 y no borra', async () => {
    const e = crearEntorno();
    e.prisma.solicitud.updateMany.mockResolvedValue({ count: 0 });
    const error = await rechazo(e.servicio.quitarReserva(SOLICITUD_ID, 'r-1', usuario));
    expect(error).toMatchObject({ codigo: 'SOLICITUD_NO_EDITABLE', status: 409 });
    expect(e.prisma.reservaItem.deleteMany).not.toHaveBeenCalled();
  });

  it('el límite de reservas se verifica dentro de la transacción, ya con la solicitud bloqueada', async () => {
    const e = crearEntorno();
    e.prisma.reservaItem.findMany.mockResolvedValue(
      Array.from({ length: 20 }, () => ({
        espacioId: 'otro',
        inicio: new Date('2026-12-01T13:00:00.000Z'),
        fin: new Date('2026-12-01T14:00:00.000Z'),
      })),
    );
    const error = await rechazo(e.servicio.agregarReserva(SOLICITUD_ID, reserva(), usuario));
    expect(error).toMatchObject({ codigo: 'LIMITE_DE_ITEMS', status: 422 });
    expect(e.prisma.reservaItem.create).not.toHaveBeenCalled();
  });

  it('un servicio cuyo valor por cantidad desborda un entero de PostgreSQL da 422 VALOR_EXCEDIDO', async () => {
    const e = crearEntorno();
    e.prisma.tarifa.findFirst.mockResolvedValue({ valor: 2_000_000_000 });
    const error = await rechazo(
      e.servicio.agregarServicio(SOLICITUD_ID, { servicioId: SERVICIO_ID, cantidad: 2 }, usuario),
    );
    expect(error).toMatchObject({ codigo: 'VALOR_EXCEDIDO', status: 422 });
    expect(e.prisma.servicioItem.create).not.toHaveBeenCalled();
  });
});

describe('ItemsService servicios', () => {
  it('agrega el servicio con la tarifa vigente del tipo de tarifa', async () => {
    const e = crearEntorno();
    const item = await e.servicio.agregarServicio(SOLICITUD_ID, { servicioId: SERVICIO_ID, cantidad: 2 }, usuario);

    expect(item).toMatchObject({
      id: 's-1',
      nombre: 'Sonido',
      cantidad: 2,
      valorUnitario: 150_000,
      subtotal: 300_000,
      estadoConfirmacion: 'PENDIENTE',
    });
    const { where } = e.prisma.tarifa.findFirst.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(where).toMatchObject({ servicioId: SERVICIO_ID, tipoSolicitante: 'INTERNO' });
  });

  it('sin tarifa definida el valor estimado es 0', async () => {
    const e = crearEntorno();
    e.prisma.tarifa.findFirst.mockResolvedValue(null);
    const item = await e.servicio.agregarServicio(SOLICITUD_ID, { servicioId: SERVICIO_ID, cantidad: 1 }, usuario);
    expect(item).toMatchObject({ valorUnitario: 0, subtotal: 0 });
  });

  it('una cantidad sobre el máximo da 422 CANTIDAD_EXCEDIDA', async () => {
    const e = crearEntorno();
    const error = await rechazo(
      e.servicio.agregarServicio(SOLICITUD_ID, { servicioId: SERVICIO_ID, cantidad: 3 }, usuario),
    );
    expect(error).toMatchObject({ codigo: 'CANTIDAD_EXCEDIDA', status: 422 });
  });

  it('un servicio repetido da 409 SERVICIO_DUPLICADO', async () => {
    const e = crearEntorno();
    e.prisma.servicioItem.findMany.mockResolvedValue([{ servicioId: SERVICIO_ID }]);
    const error = await rechazo(
      e.servicio.agregarServicio(SOLICITUD_ID, { servicioId: SERVICIO_ID, cantidad: 1 }, usuario),
    );
    expect(error).toMatchObject({ codigo: 'SERVICIO_DUPLICADO', status: 409 });
  });

  it('un servicio inexistente o inactivo da 404', async () => {
    const e = crearEntorno();
    e.prisma.servicioComplementario.findFirst.mockResolvedValue(null);
    const error = await rechazo(
      e.servicio.agregarServicio(SOLICITUD_ID, { servicioId: SERVICIO_ID, cantidad: 1 }, usuario),
    );
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
  });

  it('quitarServicio responde 404 si el ítem no es de la solicitud', async () => {
    const e = crearEntorno();
    e.prisma.servicioItem.deleteMany.mockResolvedValue({ count: 0 });
    const error = await rechazo(e.servicio.quitarServicio(SOLICITUD_ID, 's-9', usuario));
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
  });
});
