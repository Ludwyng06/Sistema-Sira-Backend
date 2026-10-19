import { describe, expect, it } from 'vitest';
import {
  calcularTarifaEspacio,
  type RecargosConfigurados,
  TarifaNoDefinidaError,
  type TarifaVigente,
} from './calculo.js';

const tarifa = (unidad: TarifaVigente['unidad'], valor: number, extra: Partial<TarifaVigente> = {}): TarifaVigente => ({
  unidad,
  valor,
  ivaAplica: false,
  porcentajeIva: 0,
  ...extra,
});

const RECARGOS: RecargosConfigurados = {
  NOCTURNO: { porcentaje: 20, desdeHora: '18:00' },
  DOMINICAL: { porcentaje: 25 },
  FESTIVO: { porcentaje: 25 },
};

/** Hora de Bogotá a instante UTC. */
const bogota = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-05:00`);

const calcular = (
  inicio: Date,
  fin: Date,
  tarifas: TarifaVigente[],
  opciones: { festivos?: string[]; recargos?: RecargosConfigurados } = {},
) =>
  calcularTarifaEspacio({
    inicio,
    fin,
    tarifas,
    festivos: new Set(opciones.festivos ?? []),
    recargos: opciones.recargos ?? RECARGOS,
  });

describe('calcularTarifaEspacio', () => {
  it('cobra por hora cuando es lo único definido', () => {
    const r = calcular(bogota('2026-11-03', '08:00'), bogota('2026-11-03', '11:00'), [tarifa('HORA', 20_000)]);
    expect(r).toMatchObject({ base: 60_000, recargos: 0, iva: 0, total: 60_000 });
    expect(r.lineas).toEqual([
      { fecha: '2026-11-03', horas: 3, unidad: 'HORA', cantidad: 3, base: 60_000, recargos: [], subtotal: 60_000 },
    ]);
  });

  it('elige la jornada cuando cuesta menos que las horas', () => {
    const r = calcular(bogota('2026-11-03', '08:00'), bogota('2026-11-03', '12:00'), [
      tarifa('HORA', 20_000),
      tarifa('JORNADA_MANANA', 60_000),
    ]);
    expect(r.lineas[0]).toMatchObject({ unidad: 'JORNADA_MANANA', cantidad: 1, base: 60_000 });
  });

  it('elige las horas cuando salen más baratas que la jornada', () => {
    const r = calcular(bogota('2026-11-03', '08:00'), bogota('2026-11-03', '10:00'), [
      tarifa('HORA', 20_000),
      tarifa('JORNADA_MANANA', 60_000),
    ]);
    expect(r.lineas[0]).toMatchObject({ unidad: 'HORA', base: 40_000 });
  });

  it('cobra el día completo si es menor que las horas', () => {
    const r = calcular(bogota('2026-11-03', '07:00'), bogota('2026-11-03', '17:00'), [
      tarifa('HORA', 30_000),
      tarifa('DIA', 150_000),
    ]);
    expect(r.lineas[0]).toMatchObject({ unidad: 'DIA', cantidad: 1, base: 150_000 });
  });

  it('combina dos jornadas cuando la franja las cruza', () => {
    const r = calcular(bogota('2026-11-03', '10:00'), bogota('2026-11-03', '14:00'), [
      tarifa('HORA', 30_000),
      tarifa('JORNADA_MANANA', 50_000),
      tarifa('JORNADA_TARDE', 50_000),
    ]);
    expect(r.lineas[0]).toMatchObject({ unidad: 'JORNADAS', cantidad: 2, base: 100_000 });
  });

  it('redondea hacia arriba las horas incompletas', () => {
    const r = calcular(bogota('2026-11-03', '08:00'), bogota('2026-11-03', '09:30'), [tarifa('HORA', 10_000)]);
    expect(r.lineas[0]).toMatchObject({ horas: 1.5, cantidad: 2, base: 20_000 });
  });

  it('aplica el recargo nocturno de forma proporcional a las horas de noche', () => {
    const r = calcular(bogota('2026-11-03', '17:00'), bogota('2026-11-03', '21:00'), [tarifa('HORA', 10_000)]);
    expect(r.lineas[0]?.recargos).toEqual([{ tipo: 'NOCTURNO', porcentaje: 20, valor: 6_000 }]);
    expect(r).toMatchObject({ base: 40_000, recargos: 6_000, total: 46_000 });
  });

  it('aplica el recargo dominical a todo el día', () => {
    const r = calcular(bogota('2026-11-01', '08:00'), bogota('2026-11-01', '10:00'), [tarifa('HORA', 10_000)]);
    expect(r.lineas[0]?.recargos).toEqual([{ tipo: 'DOMINICAL', porcentaje: 25, valor: 5_000 }]);
    expect(r.total).toBe(25_000);
  });

  it('el festivo prevalece sobre el dominical y no se acumulan', () => {
    const r = calcular(
      bogota('2026-11-01', '08:00'),
      bogota('2026-11-01', '10:00'),
      [tarifa('HORA', 10_000)],
      { festivos: ['2026-11-01'] },
    );
    expect(r.lineas[0]?.recargos.map((x) => x.tipo)).toEqual(['FESTIVO']);
    expect(r.total).toBe(25_000);
  });

  it('un día entre semana sin recargos configurados no suma nada', () => {
    const r = calcular(
      bogota('2026-11-01', '17:00'),
      bogota('2026-11-01', '21:00'),
      [tarifa('HORA', 10_000)],
      { recargos: {} },
    );
    expect(r.recargos).toBe(0);
  });

  it('divide por día una franja que cruza la medianoche', () => {
    const r = calcular(bogota('2026-11-03', '22:00'), bogota('2026-11-04', '02:00'), [tarifa('HORA', 10_000)]);
    expect(r.lineas.map((l) => [l.fecha, l.horas])).toEqual([
      ['2026-11-03', 2],
      ['2026-11-04', 2],
    ]);
    expect(r.lineas.every((l) => l.recargos.some((x) => x.tipo === 'NOCTURNO'))).toBe(true);
  });

  it('calcula el IVA sobre el subtotal cuando la tarifa lo aplica', () => {
    const r = calcular(bogota('2026-11-03', '08:00'), bogota('2026-11-03', '10:00'), [
      tarifa('HORA', 50_000, { ivaAplica: true, porcentajeIva: 19 }),
    ]);
    expect(r).toMatchObject({ subtotal: 100_000, iva: 19_000, total: 119_000 });
  });

  it('lanza TarifaNoDefinidaError si ninguna unidad cubre la franja', () => {
    expect(() =>
      calcular(bogota('2026-11-03', '08:00'), bogota('2026-11-03', '10:00'), [tarifa('JORNADA_TARDE', 80_000)]),
    ).toThrow(TarifaNoDefinidaError);
  });

  it('lanza un error si el fin no es posterior al inicio', () => {
    const t = bogota('2026-11-03', '08:00');
    expect(() => calcular(t, t, [tarifa('HORA', 10_000)])).toThrow();
  });
});
