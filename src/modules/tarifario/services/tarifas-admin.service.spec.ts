import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { CrearTarifaDto } from '../dto/admin.dto.js';
import { TarifasAdminService } from './tarifas-admin.service.js';

const ESPACIO_ID = '8a3b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';
const SERVICIO_ID = '4d1b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';
const decimal = (valor: number) => ({ toString: () => String(valor) });

const fila = (cambios: Record<string, unknown> = {}) => ({
  id: 't-1',
  espacioId: ESPACIO_ID,
  servicioId: null,
  tipoSolicitante: 'EMPRESA',
  unidad: 'HORA',
  valor: 80_000,
  valorEnSmmlv: null,
  vigenciaDesde: new Date('2026-01-01T00:00:00.000Z'),
  vigenciaHasta: null,
  acuerdoSoporte: null,
  ivaAplica: false,
  porcentajeIva: decimal(0),
  creadoEn: new Date('2026-10-22T15:00:00.000Z'),
  ...cambios,
});

function crearEntorno() {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    tarifa: {
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(fila({ ...args.data, porcentajeIva: decimal(Number(args.data.porcentajeIva ?? 0)) })),
      ),
    },
  };
  const prisma = {
    espacio: { findFirst: vi.fn().mockResolvedValue({ id: ESPACIO_ID }) },
    servicioComplementario: { findUnique: vi.fn().mockResolvedValue({ id: SERVICIO_ID }) },
    smmlv: { findUnique: vi.fn().mockResolvedValue({ anio: 2026, valor: 1_750_905 }) },
    tarifa: {
      findUnique: vi.fn().mockResolvedValue(fila()),
      update: vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve(fila(args.data))),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn((fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { servicio: new TarifasAdminService(prisma as unknown as PrismaService), prisma, tx };
}

const base = (cambios: Partial<CrearTarifaDto> = {}): CrearTarifaDto => ({
  espacioId: ESPACIO_ID,
  tipoSolicitante: 'EMPRESA',
  unidad: 'HORA',
  valor: 90_000,
  vigenciaDesde: '2026-11-01',
  ...cambios,
});

const rechazo = (promesa: Promise<unknown>): Promise<unknown> => promesa.catch((e: unknown) => e);

describe('TarifasAdminService.crear', () => {
  it('cierra la vigencia anterior el día previo y crea la nueva en una transacción', async () => {
    const e = crearEntorno();
    const r = await e.servicio.crear(base({ acuerdoSoporte: ' Acuerdo 012 ' }));

    const combinacion = { espacioId: ESPACIO_ID, servicioId: null, tipoSolicitante: 'EMPRESA', unidad: 'HORA' };
    expect(e.tx.tarifa.findFirst).toHaveBeenCalledWith({
      where: { ...combinacion, vigenciaDesde: { gte: new Date('2026-11-01T00:00:00.000Z') } },
      select: { id: true },
    });
    expect(e.tx.tarifa.updateMany).toHaveBeenCalledWith({
      where: {
        ...combinacion,
        vigenciaDesde: { lt: new Date('2026-11-01T00:00:00.000Z') },
        OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: new Date('2026-11-01T00:00:00.000Z') } }],
      },
      data: { vigenciaHasta: new Date('2026-10-31T00:00:00.000Z') },
    });
    expect(e.tx.tarifa.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        espacioId: ESPACIO_ID,
        servicioId: null,
        valor: 90_000,
        valorEnSmmlv: null,
        vigenciaDesde: new Date('2026-11-01T00:00:00.000Z'),
        vigenciaHasta: null,
        acuerdoSoporte: 'Acuerdo 012',
        ivaAplica: false,
        porcentajeIva: 0,
      }),
    });
    expect(r).toMatchObject({ valor: 90_000, vigenciaDesde: '2026-11-01', vigenciaHasta: null });
  });

  it('una tarifa de servicio no lleva unidad y valida que el servicio exista', async () => {
    const e = crearEntorno();
    await e.servicio.crear({
      servicioId: SERVICIO_ID,
      tipoSolicitante: 'PERSONA_NATURAL',
      valor: 150_000,
      ivaAplica: true,
      porcentajeIva: 19,
      vigenciaDesde: '2026-11-01',
    });
    expect(e.prisma.servicioComplementario.findUnique).toHaveBeenCalledWith({
      where: { id: SERVICIO_ID },
      select: { id: true },
    });
    expect(e.tx.tarifa.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        espacioId: null,
        servicioId: SERVICIO_ID,
        unidad: null,
        ivaAplica: true,
        porcentajeIva: 19,
      }),
    });
  });

  it('resuelve valorEnSmmlv con el salario del año de inicio de la vigencia (RN-06)', async () => {
    const e = crearEntorno();
    await e.servicio.crear(base({ valor: undefined, valorEnSmmlv: 0.05 }));
    expect(e.prisma.smmlv.findUnique).toHaveBeenCalledWith({ where: { anio: 2026 } });
    expect(e.tx.tarifa.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ valor: Math.round(0.05 * 1_750_905), valorEnSmmlv: 0.05 }),
    });
  });

  it('sin salario mínimo del año responde 422 SMMLV_NO_DEFINIDO', async () => {
    const e = crearEntorno();
    e.prisma.smmlv.findUnique.mockResolvedValue(null);
    const error = await rechazo(e.servicio.crear(base({ valor: undefined, valorEnSmmlv: 0.05 })));
    expect(error).toMatchObject({ codigo: 'SMMLV_NO_DEFINIDO', status: 422 });
  });

  it.each([
    ['sin espacio ni servicio', { espacioId: undefined }],
    ['con espacio y servicio a la vez', { servicioId: SERVICIO_ID }],
    ['de un espacio sin unidad', { unidad: undefined }],
    ['de un servicio con unidad', { espacioId: undefined, servicioId: SERVICIO_ID }],
    ['sin valor ni valorEnSmmlv', { valor: undefined }],
    ['con valor y valorEnSmmlv', { valorEnSmmlv: 0.05 }],
    ['con IVA sin porcentaje', { ivaAplica: true }],
    ['con porcentaje de IVA sin aplicar IVA', { porcentajeIva: 19 }],
    ['con vigencia final anterior a la inicial', { vigenciaHasta: '2026-10-01' }],
  ])('rechaza una tarifa %s con 422 TARIFA_INVALIDA', async (_caso, cambios) => {
    const e = crearEntorno();
    const error = await rechazo(e.servicio.crear(base(cambios as Partial<CrearTarifaDto>)));
    expect(error).toMatchObject({ codigo: 'TARIFA_INVALIDA', status: 422 });
    expect(e.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('una fecha imposible responde 400 FECHA_INVALIDA', async () => {
    const e = crearEntorno();
    const error = await rechazo(e.servicio.crear(base({ vigenciaDesde: '2026-02-30' })));
    expect(error).toMatchObject({ codigo: 'FECHA_INVALIDA', status: 400 });
  });

  it('un espacio inexistente o archivado responde 404', async () => {
    const e = crearEntorno();
    e.prisma.espacio.findFirst.mockResolvedValue(null);
    const error = await rechazo(e.servicio.crear(base()));
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
  });

  it('una tarifa posterior o del mismo día responde 409 TARIFA_SOLAPADA y no cierra nada', async () => {
    const e = crearEntorno();
    e.tx.tarifa.findFirst.mockResolvedValue({ id: 't-9' });
    const error = await rechazo(e.servicio.crear(base()));
    expect(error).toMatchObject({ codigo: 'TARIFA_SOLAPADA', status: 409 });
    expect(e.tx.tarifa.updateMany).not.toHaveBeenCalled();
    expect(e.tx.tarifa.create).not.toHaveBeenCalled();
  });
});

describe('TarifasAdminService.actualizar', () => {
  it('cierra la vigencia sin tocar el valor (RN-05)', async () => {
    const e = crearEntorno();
    const r = await e.servicio.actualizar('t-1', { vigenciaHasta: '2026-12-31' });
    expect(e.prisma.tarifa.update).toHaveBeenCalledWith({
      where: { id: 't-1' },
      data: { vigenciaHasta: new Date('2026-12-31T00:00:00.000Z') },
    });
    expect(r.vigenciaHasta).toBe('2026-12-31');
  });

  it('edita solo el acuerdo de soporte', async () => {
    const e = crearEntorno();
    await e.servicio.actualizar('t-1', { acuerdoSoporte: ' Acuerdo 015 ' });
    expect(e.prisma.tarifa.update).toHaveBeenCalledWith({
      where: { id: 't-1' },
      data: { acuerdoSoporte: 'Acuerdo 015' },
    });
  });

  it('sin campos responde 422 SIN_CAMBIOS', async () => {
    const e = crearEntorno();
    const error = await rechazo(e.servicio.actualizar('t-1', {}));
    expect(error).toMatchObject({ codigo: 'SIN_CAMBIOS', status: 422 });
  });

  it('una tarifa inexistente responde 404', async () => {
    const e = crearEntorno();
    e.prisma.tarifa.findUnique.mockResolvedValue(null);
    const error = await rechazo(e.servicio.actualizar('t-9', { acuerdoSoporte: 'x' }));
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
  });

  it('no permite cerrar antes del inicio ni extender una vigencia ya cerrada', async () => {
    const e = crearEntorno();
    const antes = await rechazo(e.servicio.actualizar('t-1', { vigenciaHasta: '2025-12-31' }));
    expect(antes).toMatchObject({ codigo: 'TARIFA_INVALIDA', status: 422 });

    e.prisma.tarifa.findUnique.mockResolvedValue(fila({ vigenciaHasta: new Date('2026-06-30T00:00:00.000Z') }));
    const extender = await rechazo(e.servicio.actualizar('t-1', { vigenciaHasta: '2026-12-31' }));
    expect(extender).toMatchObject({ codigo: 'TARIFA_INVALIDA', status: 422 });
    expect(e.prisma.tarifa.update).not.toHaveBeenCalled();
  });
});

describe('TarifasAdminService.listar', () => {
  it('filtra por combinación y por vigentes a la fecha local', async () => {
    const e = crearEntorno();
    e.prisma.tarifa.count.mockResolvedValue(1);
    e.prisma.tarifa.findMany.mockResolvedValue([fila({ valorEnSmmlv: decimal(0.05), porcentajeIva: decimal(19) })]);
    const r = await e.servicio.listar(
      { espacioId: ESPACIO_ID, tipoSolicitante: 'EMPRESA', vigentes: true, pagina: 2, porPagina: 10 },
      new Date('2026-10-22T15:00:00.000Z'),
    );

    const hoy = new Date('2026-10-22T00:00:00.000Z');
    expect(e.prisma.tarifa.findMany).toHaveBeenCalledWith({
      where: {
        espacioId: ESPACIO_ID,
        tipoSolicitante: 'EMPRESA',
        vigenciaDesde: { lte: hoy },
        OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: hoy } }],
      },
      orderBy: [{ vigenciaDesde: 'desc' }, { creadoEn: 'desc' }],
      skip: 10,
      take: 10,
    });
    expect(r).toMatchObject({ total: 1, pagina: 2, porPagina: 10 });
    expect(r.datos[0]).toMatchObject({ valorEnSmmlv: 0.05, porcentajeIva: 19, vigenciaDesde: '2026-01-01' });
  });

  it('sin filtros lista todo', async () => {
    const e = crearEntorno();
    await e.servicio.listar({ vigentes: false, pagina: 1, porPagina: 20 });
    const { where } = e.prisma.tarifa.findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(where).toEqual({});
  });
});
