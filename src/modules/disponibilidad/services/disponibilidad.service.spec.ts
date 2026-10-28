import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { ConsultaDisponibilidadDto } from '../dto/consulta-disponibilidad.dto.js';
import { DisponibilidadService } from './disponibilidad.service.js';

const ESPACIO_ID = '8a3b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';

function crearEntorno(filas: unknown[] = [], espacio: unknown = { id: ESPACIO_ID }) {
  const prisma = {
    espacio: { findFirst: vi.fn().mockResolvedValue(espacio) },
    $queryRaw: vi.fn().mockResolvedValue(filas),
  };
  return { servicio: new DisponibilidadService(prisma as unknown as PrismaService), prisma };
}

const consulta = (cambios: Partial<ConsultaDisponibilidadDto> = {}): ConsultaDisponibilidadDto => ({
  espacioId: ESPACIO_ID,
  desde: '2026-11-02T00:00:00.000Z',
  hasta: '2026-11-09T00:00:00.000Z',
  ...cambios,
});

const rechazo = (promesa: Promise<unknown>): Promise<unknown> => promesa.catch((e: unknown) => e);

describe('DisponibilidadService.consultar', () => {
  it('devuelve las franjas con estado y etiqueta, sin datos personales', async () => {
    const { servicio } = crearEntorno([
      {
        inicio: new Date('2026-11-03T13:00:00.000Z'),
        fin: new Date('2026-11-03T15:00:00.000Z'),
        estado: 'CONFIRMADA',
        etiquetaPublica: 'Congreso de Ingeniería',
      },
      {
        inicio: new Date('2026-11-04T13:00:00.000Z'),
        fin: new Date('2026-11-04T15:00:00.000Z'),
        estado: 'BLOQUEO',
        etiquetaPublica: null,
      },
      {
        inicio: new Date('2026-11-05T13:00:00.000Z'),
        fin: new Date('2026-11-05T15:00:00.000Z'),
        estado: 'RETENIDA',
        etiquetaPublica: '   ',
      },
    ]);
    const resultado = await servicio.consultar(consulta());

    expect(resultado.espacioId).toBe(ESPACIO_ID);
    expect(resultado.franjas).toEqual([
      {
        inicio: '2026-11-03T13:00:00.000Z',
        fin: '2026-11-03T15:00:00.000Z',
        estado: 'CONFIRMADA',
        etiqueta: 'Congreso de Ingeniería',
      },
      {
        inicio: '2026-11-04T13:00:00.000Z',
        fin: '2026-11-04T15:00:00.000Z',
        estado: 'BLOQUEO',
        etiqueta: 'Ocupado',
      },
      {
        inicio: '2026-11-05T13:00:00.000Z',
        fin: '2026-11-05T15:00:00.000Z',
        estado: 'RETENIDA',
        etiqueta: 'Ocupado',
      },
    ]);
    for (const franja of resultado.franjas) {
      expect(Object.keys(franja).sort()).toEqual(['estado', 'etiqueta', 'fin', 'inicio']);
    }
  });

  it('filtra por periodo con el operador de solapamiento y excluye las liberadas', async () => {
    const { servicio, prisma } = crearEntorno();
    await servicio.consultar(consulta());

    const [plantilla] = prisma.$queryRaw.mock.calls[0] as [readonly string[]];
    const sql = plantilla.join('?');
    expect(sql).toContain('periodo && tstzrange');
    expect(sql).toContain("estado <> 'LIBERADA'");
  });

  it('un espacio inexistente o no reservable da 404', async () => {
    const { servicio, prisma } = crearEntorno([], null);
    const error = await rechazo(servicio.consultar(consulta()));

    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it.each([
    ['hasta igual a desde', { hasta: '2026-11-02T00:00:00.000Z' }],
    ['hasta anterior a desde', { hasta: '2026-10-01T00:00:00.000Z' }],
    ['rango de más de 62 días', { hasta: '2027-02-01T00:00:00.000Z' }],
  ])('rechaza %s con 400 RANGO_INVALIDO', async (_caso, cambios) => {
    const { servicio, prisma } = crearEntorno();
    const error = await rechazo(servicio.consultar(consulta(cambios)));

    expect(error).toMatchObject({ codigo: 'RANGO_INVALIDO', status: 400 });
    expect(prisma.espacio.findFirst).not.toHaveBeenCalled();
  });

  it('acepta un rango de exactamente 62 días', async () => {
    const { servicio } = crearEntorno();
    await expect(
      servicio.consultar(consulta({ desde: '2026-11-01T00:00:00.000Z', hasta: '2027-01-02T00:00:00.000Z' })),
    ).resolves.toMatchObject({ franjas: [] });
  });
});
