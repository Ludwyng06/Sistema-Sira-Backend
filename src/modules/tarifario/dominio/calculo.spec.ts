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
  DOMINICAL_DIURNO: { porcentaje: 25 },
  DOMINICAL_NOCTURNO: { porcentaje: 50 },
  FESTIVO_DIURNO: { porcentaje: 30 },
  FESTIVO_NOCTURNO: { porcentaje: 60 },
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

  it('entre semana la porción diurna no lleva recargo', () => {
    const r = calcular(bogota('2026-11-07', '08:00'), bogota('2026-11-07', '12:00'), [tarifa('HORA', 10_000)]);
    expect(r.lineas[0]?.recargos).toEqual([]);
  });

  it('aplica el nocturno a la madrugada de un día entre semana', () => {
    const r = calcular(bogota('2026-11-03', '04:00'), bogota('2026-11-03', '06:00'), [tarifa('HORA', 10_000)]);
    expect(r.lineas[0]?.recargos).toEqual([{ tipo: 'NOCTURNO', porcentaje: 20, valor: 4_000 }]);
  });

  it('domingo diurno: aplica solo DOMINICAL_DIURNO', () => {
    const r = calcular(bogota('2026-11-01', '08:00'), bogota('2026-11-01', '10:00'), [tarifa('HORA', 10_000)]);
    expect(r.lineas[0]?.recargos).toEqual([{ tipo: 'DOMINICAL_DIURNO', porcentaje: 25, valor: 5_000 }]);
    expect(r.total).toBe(25_000);
  });

  it('domingo nocturno: aplica solo DOMINICAL_NOCTURNO, sin sumar el NOCTURNO', () => {
    const r = calcular(bogota('2026-11-01', '19:00'), bogota('2026-11-01', '21:00'), [tarifa('HORA', 10_000)]);
    expect(r.lineas[0]?.recargos).toEqual([{ tipo: 'DOMINICAL_NOCTURNO', porcentaje: 50, valor: 10_000 }]);
    expect(r.total).toBe(30_000);
  });

  it('domingo de madrugada es DOMINICAL_NOCTURNO', () => {
    const r = calcular(bogota('2026-11-01', '02:00'), bogota('2026-11-01', '04:00'), [tarifa('HORA', 10_000)]);
    expect(r.lineas[0]?.recargos).toEqual([{ tipo: 'DOMINICAL_NOCTURNO', porcentaje: 50, valor: 10_000 }]);
  });

  it('domingo que cruza la hora nocturna divide entre diurno y nocturno', () => {
    const r = calcular(bogota('2026-11-01', '16:00'), bogota('2026-11-01', '20:00'), [tarifa('HORA', 10_000)]);
    // 2 h diurnas al 25 % (5.000) y 2 h nocturnas al 50 % (10.000) sobre una base de 40.000.
    expect(r.lineas[0]?.recargos).toEqual([
      { tipo: 'DOMINICAL_DIURNO', porcentaje: 25, valor: 5_000 },
      { tipo: 'DOMINICAL_NOCTURNO', porcentaje: 50, valor: 10_000 },
    ]);
    expect(r).toMatchObject({ base: 40_000, recargos: 15_000, total: 55_000 });
  });

  it('festivo en domingo: prevalece el festivo y no se acumula con el dominical', () => {
    const r = calcular(
      bogota('2026-11-01', '08:00'),
      bogota('2026-11-01', '10:00'),
      [tarifa('HORA', 10_000)],
      { festivos: ['2026-11-01'] },
    );
    expect(r.lineas[0]?.recargos).toEqual([{ tipo: 'FESTIVO_DIURNO', porcentaje: 30, valor: 6_000 }]);
    expect(r.total).toBe(26_000);
  });

  it('festivo nocturno: aplica solo FESTIVO_NOCTURNO', () => {
    const r = calcular(
      bogota('2026-11-02', '18:00'),
      bogota('2026-11-02', '20:00'),
      [tarifa('HORA', 10_000)],
      { festivos: ['2026-11-02'] },
    );
    expect(r.lineas[0]?.recargos).toEqual([{ tipo: 'FESTIVO_NOCTURNO', porcentaje: 60, valor: 12_000 }]);
    expect(r.total).toBe(32_000);
  });

  it('festivo que cruza la hora nocturna configurada (19:30) divide en proporción', () => {
    const r = calcular(
      bogota('2026-11-02', '18:00'),
      bogota('2026-11-02', '22:00'),
      [tarifa('HORA', 10_000)],
      { festivos: ['2026-11-02'], recargos: { ...RECARGOS, NOCTURNO: { porcentaje: 20, desdeHora: '19:30' } } },
    );
    // 1,5 h diurnas al 30 % (4.500) y 2,5 h nocturnas al 60 % (15.000) sobre 40.000.
    expect(r.lineas[0]?.recargos).toEqual([
      { tipo: 'FESTIVO_DIURNO', porcentaje: 30, valor: 4_500 },
      { tipo: 'FESTIVO_NOCTURNO', porcentaje: 60, valor: 15_000 },
    ]);
  });

  it('las nocturnas dominical y festiva usan horaNocturna aunque el NOCTURNO esté inactivo', () => {
    const { NOCTURNO: _omitido, ...sinNocturno } = RECARGOS;
    const r = calcularTarifaEspacio({
      inicio: bogota('2026-11-01', '19:00'),
      fin: bogota('2026-11-01', '21:00'),
      tarifas: [tarifa('HORA', 10_000)],
      festivos: new Set(),
      recargos: sinNocturno,
      horaNocturna: '20:00',
    });
    expect(r.lineas[0]?.recargos).toEqual([
      { tipo: 'DOMINICAL_DIURNO', porcentaje: 25, valor: 2_500 },
      { tipo: 'DOMINICAL_NOCTURNO', porcentaje: 50, valor: 5_000 },
    ]);
  });

  it('si el recargo específico está inactivo no cae a otro', () => {
    const { DOMINICAL_NOCTURNO: _a, FESTIVO_DIURNO: _b, ...parciales } = RECARGOS;
    const domingo = calcular(bogota('2026-11-01', '19:00'), bogota('2026-11-01', '21:00'), [tarifa('HORA', 10_000)], {
      recargos: parciales,
    });
    expect(domingo.lineas[0]?.recargos).toEqual([]);
    const festivo = calcular(bogota('2026-11-02', '08:00'), bogota('2026-11-02', '10:00'), [tarifa('HORA', 10_000)], {
      festivos: ['2026-11-02'],
      recargos: parciales,
    });
    expect(festivo.lineas[0]?.recargos).toEqual([]);
  });

  it('el nocturno inactivo deja sin recargo la noche entre semana', () => {
    const { NOCTURNO: _omitido, ...sinNocturno } = RECARGOS;
    const r = calcular(bogota('2026-11-03', '19:00'), bogota('2026-11-03', '21:00'), [tarifa('HORA', 10_000)], {
      recargos: sinNocturno,
    });
    expect(r.recargos).toBe(0);
  });

  it('soporta porcentajes de 125 % y 300 %', () => {
    const recargos: RecargosConfigurados = {
      NOCTURNO: { porcentaje: 20, desdeHora: '18:00' },
      DOMINICAL_DIURNO: { porcentaje: 125 },
      DOMINICAL_NOCTURNO: { porcentaje: 300 },
    };
    const r = calcular(bogota('2026-11-01', '17:00'), bogota('2026-11-01', '19:00'), [tarifa('HORA', 10_000)], {
      recargos,
    });
    expect(r.lineas[0]?.recargos).toEqual([
      { tipo: 'DOMINICAL_DIURNO', porcentaje: 125, valor: 12_500 },
      { tipo: 'DOMINICAL_NOCTURNO', porcentaje: 300, valor: 30_000 },
    ]);
    expect(r.total).toBe(62_500);
  });

  it('redondea cada recargo a pesos enteros (porcentaje con decimales)', () => {
    const r = calcular(bogota('2026-11-01', '08:00'), bogota('2026-11-01', '09:00'), [tarifa('HORA', 10_001)], {
      recargos: { DOMINICAL_DIURNO: { porcentaje: 12.55 } },
    });
    // 10.001 × 12,55 % = 1.255,1255 → 1.255.
    expect(r.lineas[0]?.recargos).toEqual([{ tipo: 'DOMINICAL_DIURNO', porcentaje: 12.55, valor: 1_255 }]);
    expect(Number.isInteger(r.total)).toBe(true);
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
