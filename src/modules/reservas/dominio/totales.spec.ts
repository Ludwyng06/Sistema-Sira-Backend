import { describe, expect, it } from 'vitest';
import { calcularTarifaEspacio, type TarifaVigente } from '../../tarifario/dominio/calculo.js';
import { type FranjaCalculada, totalizarSolicitud } from './totales.js';

const bogota = (fecha: string, hhmm: string) => new Date(`${fecha}T${hhmm}:00-05:00`);
const RECARGOS = { NOCTURNO: { porcentaje: 20, desdeHora: '18:00' } };
const HORA = (valor: number, iva = false): TarifaVigente => ({
  unidad: 'HORA',
  valor,
  ivaAplica: iva,
  porcentajeIva: iva ? 19 : 0,
});

const calculo = (inicio: string, fin: string, tarifa: TarifaVigente, fecha = '2026-11-03') =>
  calcularTarifaEspacio({
    inicio: bogota(fecha, inicio),
    fin: bogota(fecha, fin),
    tarifas: [tarifa],
    festivos: new Set(),
    recargos: RECARGOS,
  });

/** Franja de un espacio; el depósito (fijo y porcentaje) es del espacio. */
const franja = (
  inicio: string,
  fin: string,
  tarifa: TarifaVigente,
  opciones: { espacioId?: string; fijo?: number | null; porcentaje?: number; fecha?: string } = {},
): FranjaCalculada => ({
  ...calculo(inicio, fin, tarifa, opciones.fecha),
  espacioId: opciones.espacioId ?? 'esp-1',
  depositoValorFijo: opciones.fijo ?? null,
  depositoPorcentaje: opciones.porcentaje ?? 0,
});

describe('totalizarSolicitud', () => {
  it('franja diurna: sin recargos ni IVA', () => {
    const t = totalizarSolicitud([franja('08:00', '12:00', HORA(20_000))], 0);
    expect(t).toEqual({ base: 80_000, recargos: 0, subtotal: 80_000, iva: 0, deposito: 0, total: 80_000 });
  });

  it('franja nocturna: el recargo se suma al subtotal', () => {
    const t = totalizarSolicitud([franja('18:00', '22:00', HORA(20_000))], 0);
    expect(t).toMatchObject({ base: 80_000, recargos: 16_000, subtotal: 96_000, total: 96_000 });
  });

  it('servicio con tarifa: cantidad × tarifa entra a la base y al subtotal', () => {
    const t = totalizarSolicitud([franja('08:00', '12:00', HORA(20_000))], 2 * 50_000);
    expect(t).toMatchObject({ base: 180_000, recargos: 0, subtotal: 180_000, total: 180_000 });
  });

  it('tarifa con IVA 19 %: el IVA sale de la tarifa aplicada y se suma al total', () => {
    const f = franja('08:00', '12:00', HORA(20_000, true));
    const t = totalizarSolicitud([f], 0);
    expect(t.iva).toBe(Math.round(80_000 * 0.19));
    expect(t.total).toBe(t.subtotal + t.iva);
  });

  it('suma varias franjas', () => {
    const t = totalizarSolicitud([franja('08:00', '12:00', HORA(20_000)), franja('18:00', '22:00', HORA(30_000))], 0);
    expect(t.base).toBe(80_000 + 120_000);
    expect(t.recargos).toBe(24_000);
  });
});

describe('depósito por espacio (RF-TAR-09)', () => {
  it('es el porcentaje del subtotal del propio espacio: no cuenta otros espacios ni servicios', () => {
    const t = totalizarSolicitud(
      [
        franja('08:00', '12:00', HORA(150_000), { espacioId: 'sala', porcentaje: 20 }), // 600.000
        franja('08:00', '12:00', HORA(20_000), { espacioId: 'aula' }), // sin depósito
      ],
      100_000,
    );
    expect(t.subtotal).toBe(600_000 + 80_000 + 100_000);
    expect(t.deposito).toBe(120_000);
  });

  it('dos franjas del mismo espacio con 20 % no dan 40 %: se aplica una vez sobre la suma de sus franjas', () => {
    const t = totalizarSolicitud(
      [
        franja('08:00', '12:00', HORA(20_000), { porcentaje: 20, fecha: '2026-11-03' }),
        franja('08:00', '12:00', HORA(20_000), { porcentaje: 20, fecha: '2026-11-04' }),
      ],
      0,
    );
    expect(t.subtotal).toBe(160_000);
    expect(t.deposito).toBe(32_000);
  });

  it('incluye los recargos del espacio en la base del porcentaje', () => {
    const t = totalizarSolicitud([franja('18:00', '22:00', HORA(20_000), { porcentaje: 20 })], 0);
    expect(t.deposito).toBe(Math.round(96_000 * 0.2));
  });

  it('el valor fijo se cobra una vez por espacio distinto, no por franja', () => {
    const t = totalizarSolicitud(
      [
        franja('08:00', '12:00', HORA(20_000), { fijo: 100_000, fecha: '2026-11-03' }),
        franja('08:00', '12:00', HORA(20_000), { fijo: 100_000, fecha: '2026-11-04' }),
        franja('08:00', '12:00', HORA(20_000), { espacioId: 'esp-2', fijo: 50_000 }),
      ],
      0,
    );
    expect(t.deposito).toBe(150_000);
  });

  it('un espacio puede tener valor fijo y porcentaje a la vez', () => {
    const t = totalizarSolicitud([franja('08:00', '12:00', HORA(20_000), { fijo: 10_000, porcentaje: 10 })], 0);
    expect(t.deposito).toBe(10_000 + 8_000);
  });
});
