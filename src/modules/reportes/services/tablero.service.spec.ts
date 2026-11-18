import { describe, expect, it, vi } from 'vitest';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { TableroService } from './tablero.service.js';

const AHORA = new Date('2026-10-30T15:00:00.000Z');

const usuario = (cambios: Partial<UsuarioAutenticado> = {}): UsuarioAutenticado => ({
  id: 'u-1',
  correo: 'admin@itp.edu.co',
  roles: ['ADMINISTRADOR'],
  dependencias: [],
  correoVerificado: true,
  esInstitucional: true,
  ...cambios,
});

function crearEntorno() {
  const prisma = {
    solicitud: {
      groupBy: vi.fn().mockResolvedValue([
        { estado: 'BORRADOR', _count: { _all: 3 } },
        { estado: 'CONFIRMADA', _count: { _all: 8 } },
        { estado: 'RECHAZADA', _count: { _all: 3 } },
      ]),
    },
    ordenPago: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { valor: 4_500_000 }, _count: { _all: 9 } }),
    },
    cotizacion: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { valorReferencia: 2_300_000 }, _count: { _all: 14 } }),
    },
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce([
        { espacioId: 'e1', codigo: 'A-1', nombre: 'Aula A-1', reservadas: 10.126, bloqueadas: 100 },
        { espacioId: 'e2', codigo: 'B-1', nombre: 'Aula B-1', reservadas: 30, bloqueadas: 20.5 },
        { espacioId: 'e3', codigo: 'C-1', nombre: 'Aula C-1', reservadas: 0, bloqueadas: 5 },
      ])
      .mockResolvedValueOnce([{ horas: 31.44 }]),
  };
  return { servicio: new TableroService(prisma as unknown as PrismaService), prisma };
}

describe('TableroService.obtener', () => {
  it('arma los indicadores del periodo', async () => {
    const e = crearEntorno();
    const r = await e.servicio.obtener(
      { desde: '2026-10-01T00:00:00.000Z', hasta: '2026-10-30T00:00:00.000Z' },
      usuario(),
      AHORA,
    );

    expect(r.desde).toBe('2026-10-01T00:00:00.000Z');
    expect(r.solicitudesPorEstado).toEqual([
      { estado: 'CONFIRMADA', cantidad: 8 },
      { estado: 'BORRADOR', cantidad: 3 },
      { estado: 'RECHAZADA', cantidad: 3 },
    ]);
    expect(r.ocupacion).toEqual({
      horasReservadas: 40.13,
      horasBloqueadas: 125.5,
      espaciosMasUsados: [
        { espacioId: 'e2', codigo: 'B-1', nombre: 'Aula B-1', horasReservadas: 30 },
        { espacioId: 'e1', codigo: 'A-1', nombre: 'Aula A-1', horasReservadas: 10.13 },
      ],
    });
    expect(r.recaudo).toEqual({ total: 4_500_000, ordenesAprobadas: 9 });
    expect(r.tiempoMedioAprobacionHoras).toBe(31.4);
    expect(r.usoInternoNoCobrado).toEqual({ valorReferencia: 2_300_000, solicitudesExentas: 14 });
  });

  it('sin fechas usa los últimos 30 días', async () => {
    const e = crearEntorno();
    const r = await e.servicio.obtener({}, usuario(), AHORA);
    expect(r.hasta).toBe('2026-10-30T15:00:00.000Z');
    expect(r.desde).toBe('2026-09-30T15:00:00.000Z');
  });

  it('el administrador no filtra por dependencia', async () => {
    const e = crearEntorno();
    await e.servicio.obtener({}, usuario(), AHORA);
    const { where } = e.prisma.solicitud.groupBy.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(where).not.toHaveProperty('dependenciaId');
  });

  it('el aprobador solo ve las dependencias de su alcance', async () => {
    const e = crearEntorno();
    await e.servicio.obtener({}, usuario({ roles: ['APROBADOR'], dependencias: ['dep-1', 'dep-2'] }), AHORA);

    const { where } = e.prisma.solicitud.groupBy.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(where).toMatchObject({ dependenciaId: { in: ['dep-1', 'dep-2'] } });
    const recaudo = e.prisma.ordenPago.aggregate.mock.calls[0]![0] as {
      where: { cotizacion: { solicitud: unknown } };
    };
    expect(recaudo.where.cotizacion.solicitud).toEqual({ dependenciaId: { in: ['dep-1', 'dep-2'] } });
  });

  it('sin datos devuelve ceros y tiempo medio nulo', async () => {
    const e = crearEntorno();
    e.prisma.solicitud.groupBy.mockResolvedValue([]);
    e.prisma.ordenPago.aggregate.mockResolvedValue({ _sum: { valor: null }, _count: { _all: 0 } });
    e.prisma.cotizacion.aggregate.mockResolvedValue({ _sum: { valorReferencia: null }, _count: { _all: 0 } });
    e.prisma.$queryRaw.mockReset().mockResolvedValueOnce([]).mockResolvedValueOnce([{ horas: null }]);
    const r = await e.servicio.obtener({}, usuario(), AHORA);

    expect(r.solicitudesPorEstado).toEqual([]);
    expect(r.ocupacion).toEqual({ horasReservadas: 0, horasBloqueadas: 0, espaciosMasUsados: [] });
    expect(r.recaudo).toEqual({ total: 0, ordenesAprobadas: 0 });
    expect(r.tiempoMedioAprobacionHoras).toBeNull();
    expect(r.usoInternoNoCobrado).toEqual({ valorReferencia: 0, solicitudesExentas: 0 });
  });

  it.each([
    ['hasta anterior a desde', { desde: '2026-10-20T00:00:00.000Z', hasta: '2026-10-01T00:00:00.000Z' }],
    ['periodo de más de 366 días', { desde: '2025-01-01T00:00:00.000Z', hasta: '2026-10-01T00:00:00.000Z' }],
  ])('rechaza %s con 400 RANGO_INVALIDO', async (_caso, consulta) => {
    const e = crearEntorno();
    await expect(e.servicio.obtener(consulta, usuario(), AHORA)).rejects.toMatchObject({
      codigo: 'RANGO_INVALIDO',
      status: 400,
    });
    expect(e.prisma.solicitud.groupBy).not.toHaveBeenCalled();
  });
});
