import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../shared/prisma/prisma.service.js';
import { calcularTarifaEspacio } from './dominio/calculo.js';
import { MAXIMO_VALOR_PESOS } from './dto/admin.dto.js';
import { TarifarioService } from './services/tarifario.service.js';
import { TarifasAdminService } from './services/tarifas-admin.service.js';

const bogota = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-05:00`);

describe('recargo nocturno con una hora de inicio anterior a las 06:00', () => {
  it('no cuenta dos veces el tramo que se solapa', () => {
    const r = calcularTarifaEspacio({
      inicio: bogota('2026-11-03', '04:00'),
      fin: bogota('2026-11-03', '08:00'),
      tarifas: [{ unidad: 'HORA', valor: 10_000, ivaAplica: false, porcentajeIva: 0 }],
      festivos: new Set(),
      recargos: { NOCTURNO: { porcentaje: 20, desdeHora: '05:00' } },
    });
    // Las 4 horas son nocturnas: 20 % de 40 000, nunca más del porcentaje configurado.
    expect(r.lineas[0]?.recargos).toEqual([{ tipo: 'NOCTURNO', porcentaje: 20, valor: 8_000 }]);
    expect(r.total).toBe(48_000);
  });
});

describe('TarifarioService.calcular: límites del simulador público', () => {
  const crear = () => {
    const prisma = { espacio: { findFirst: vi.fn().mockResolvedValue({ id: 'e1' }) } };
    return { servicio: new TarifarioService(prisma as unknown as PrismaService), prisma };
  };

  it('un rango de años da 400 RANGO_INVALIDO sin consultar la base de datos', async () => {
    const e = crear();
    await expect(
      e.servicio.calcular({
        espacioId: 'e1',
        tipoSolicitante: 'EMPRESA',
        inicio: new Date('2026-01-01T00:00:00.000Z'),
        fin: new Date('2036-01-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ codigo: 'RANGO_INVALIDO', status: 400 });
    expect(e.prisma.espacio.findFirst).not.toHaveBeenCalled();
  });

  it('fechas inválidas dan 400 en lugar de un error interno', async () => {
    const e = crear();
    await expect(
      e.servicio.calcular({
        espacioId: 'e1',
        tipoSolicitante: 'EMPRESA',
        inicio: new Date('no-es-fecha'),
        fin: new Date('2026-01-02T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ codigo: 'RANGO_INVALIDO', status: 400 });
  });
});

describe('TarifasAdminService.crear (revisión)', () => {
  function crearEntorno(salario = 1_750_905) {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      tarifa: {
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({
          id: 't1',
          espacioId: 'e1',
          servicioId: null,
          tipoSolicitante: 'EMPRESA',
          unidad: 'HORA',
          valor: 1000,
          valorEnSmmlv: null,
          vigenciaDesde: new Date('2026-11-01T00:00:00.000Z'),
          vigenciaHasta: null,
          acuerdoSoporte: null,
          ivaAplica: false,
          porcentajeIva: { toString: () => '0' },
          creadoEn: new Date('2026-10-30T00:00:00.000Z'),
        }),
      },
    };
    const prisma = {
      espacio: { findFirst: vi.fn().mockResolvedValue({ id: 'e1' }) },
      smmlv: { findUnique: vi.fn().mockResolvedValue({ anio: 2026, valor: salario }) },
      $transaction: vi.fn((fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    return { servicio: new TarifasAdminService(prisma as unknown as PrismaService), tx };
  }

  const base = {
    espacioId: 'e1',
    tipoSolicitante: 'EMPRESA' as const,
    unidad: 'HORA' as const,
    vigenciaDesde: '2026-11-01',
  };

  it('toma un candado por combinación antes de revisar solapamientos', async () => {
    const e = crearEntorno();
    await e.servicio.crear({ ...base, valor: 1000 });

    expect(e.tx.$executeRaw).toHaveBeenCalledOnce();
    const orden = e.tx.$executeRaw.mock.invocationCallOrder[0]!;
    expect(orden).toBeLessThan(e.tx.tarifa.findFirst.mock.invocationCallOrder[0]!);
    const [plantilla, clave] = e.tx.$executeRaw.mock.calls[0] as [readonly string[], string];
    expect(plantilla.join('?')).toContain('pg_advisory_xact_lock');
    expect(clave).toBe('tarifa:e1:EMPRESA:HORA');
  });

  it('una tarifa en SMMLV cuyo valor en pesos desborda la columna da 422', async () => {
    const e = crearEntorno(9_000_000);
    await expect(e.servicio.crear({ ...base, valorEnSmmlv: 1000 })).rejects.toMatchObject({
      codigo: 'TARIFA_INVALIDA',
      status: 422,
    });
  });

  it('una tarifa en SMMLV dentro del tope sí se crea', async () => {
    const e = crearEntorno();
    await expect(e.servicio.crear({ ...base, valorEnSmmlv: 1000 })).resolves.toMatchObject({ id: 't1' });
  });

  it('el tope de valor coincide con el de la columna', () => {
    expect(MAXIMO_VALOR_PESOS).toBeLessThan(2_147_483_647);
  });
});
