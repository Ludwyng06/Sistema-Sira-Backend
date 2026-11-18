import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { TarifarioService } from './tarifario.service.js';

const ESPACIO_ID = '8a3b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';
const EMISION = new Date('2026-10-20T15:00:00.000Z');

const decimal = (valor: number) => ({ toString: () => String(valor) });

const fila = (cambios: Record<string, unknown> = {}) => ({
  unidad: 'HORA',
  valor: 20_000,
  valorEnSmmlv: null,
  ivaAplica: false,
  porcentajeIva: decimal(0),
  ...cambios,
});

function crearEntorno(opciones: { espacio?: unknown; tarifas?: unknown[]; smmlv?: unknown } = {}) {
  const prisma = {
    espacio: {
      findFirst: vi.fn().mockResolvedValue(opciones.espacio === undefined ? { id: ESPACIO_ID } : opciones.espacio),
    },
    tarifa: { findMany: vi.fn().mockResolvedValue(opciones.tarifas ?? [fila()]) },
    smmlv: { findUnique: vi.fn().mockResolvedValue(opciones.smmlv ?? { anio: 2026, valor: 1_750_905 }) },
    festivo: { findMany: vi.fn().mockResolvedValue([]) },
    recargo: {
      findMany: vi.fn().mockResolvedValue([
        { tipo: 'NOCTURNO', porcentaje: decimal(20), desdeHora: '18:00' },
        { tipo: 'DOMINICAL', porcentaje: decimal(25), desdeHora: null },
      ]),
    },
  };
  return { servicio: new TarifarioService(prisma as unknown as PrismaService), prisma };
}

const solicitud = (cambios: Record<string, unknown> = {}) => ({
  espacioId: ESPACIO_ID,
  tipoSolicitante: 'EMPRESA' as const,
  inicio: new Date('2026-11-03T13:00:00.000Z'),
  fin: new Date('2026-11-03T17:00:00.000Z'),
  ...cambios,
});

const rechazo = (promesa: Promise<unknown>): Promise<unknown> => promesa.catch((e: unknown) => e);

describe('TarifarioService.calcular', () => {
  it('calcula con la tarifa vigente a la fecha de emisión y devuelve el desglose', async () => {
    const { servicio, prisma } = crearEntorno();
    const r = await servicio.calcular(solicitud(), EMISION);

    expect(r).toMatchObject({ espacioId: ESPACIO_ID, tipoSolicitante: 'EMPRESA', base: 80_000, total: 80_000 });
    const { where } = prisma.tarifa.findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(where).toMatchObject({
      espacioId: ESPACIO_ID,
      tipoSolicitante: 'EMPRESA',
      vigenciaDesde: { lte: new Date('2026-10-20T00:00:00.000Z') },
      OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: new Date('2026-10-20T00:00:00.000Z') } }],
    });
  });

  it('con varias vigencias de la misma unidad usa la más reciente', async () => {
    const { servicio } = crearEntorno({ tarifas: [fila({ valor: 25_000 }), fila({ valor: 10_000 })] });
    const r = await servicio.calcular(solicitud(), EMISION);
    expect(r.base).toBe(100_000);
  });

  it('resuelve una tarifa en SMMLV con el valor del año de emisión (RN-06)', async () => {
    const { servicio, prisma } = crearEntorno({
      tarifas: [fila({ valor: 0, valorEnSmmlv: decimal(0.01) })],
    });
    const r = await servicio.calcular(solicitud({ fin: new Date('2026-11-03T14:00:00.000Z') }), EMISION);

    expect(prisma.smmlv.findUnique).toHaveBeenCalledWith({ where: { anio: 2026 } });
    expect(r.base).toBe(Math.round(0.01 * 1_750_905));
  });

  it('sin SMMLV del año responde 422 SMMLV_NO_DEFINIDO', async () => {
    const { servicio, prisma } = crearEntorno({ tarifas: [fila({ valorEnSmmlv: decimal(0.01) })] });
    prisma.smmlv.findUnique.mockResolvedValue(null);
    const error = await rechazo(servicio.calcular(solicitud(), EMISION));
    expect(error).toMatchObject({ codigo: 'SMMLV_NO_DEFINIDO', status: 422 });
  });

  it('suma recargos configurados y aplica los festivos de la base', async () => {
    const { servicio, prisma } = crearEntorno();
    prisma.festivo.findMany.mockResolvedValue([{ fecha: new Date('2026-11-03T00:00:00.000Z') }]);
    prisma.recargo.findMany.mockResolvedValue([{ tipo: 'FESTIVO', porcentaje: decimal(25), desdeHora: null }]);
    const r = await servicio.calcular(solicitud(), EMISION);

    expect(r.lineas[0]?.recargos).toEqual([{ tipo: 'FESTIVO', porcentaje: 25, valor: 20_000 }]);
    expect(r.total).toBe(100_000);
  });

  it('sin tarifas vigentes responde 422 TARIFA_NO_DEFINIDA', async () => {
    const { servicio } = crearEntorno({ tarifas: [] });
    const error = await rechazo(servicio.calcular(solicitud(), EMISION));
    expect(error).toMatchObject({ codigo: 'TARIFA_NO_DEFINIDA', status: 422, detalles: { fecha: '2026-11-03' } });
  });

  it('un espacio inexistente o no reservable da 404', async () => {
    const { servicio, prisma } = crearEntorno({ espacio: null });
    const error = await rechazo(servicio.calcular(solicitud(), EMISION));
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
    expect(prisma.tarifa.findMany).not.toHaveBeenCalled();
  });

  it('un rango invertido da 400 RANGO_INVALIDO sin consultar', async () => {
    const { servicio, prisma } = crearEntorno();
    const error = await rechazo(
      servicio.calcular(solicitud({ fin: new Date('2026-11-03T12:00:00.000Z') }), EMISION),
    );
    expect(error).toMatchObject({ codigo: 'RANGO_INVALIDO', status: 400 });
    expect(prisma.espacio.findFirst).not.toHaveBeenCalled();
  });
});
