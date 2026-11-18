import { describe, expect, it } from 'vitest';
import { distribuirPago, vencimientoSaldo } from './pagos-parciales.js';
import { repartirReembolso } from './reparto-reembolso.js';

describe('Anticipo y saldo en pesos enteros', () => {
  it('porcentaje cero conserva TOTAL con el mismo valor', () => {
    expect(distribuirPago(350000, 0)).toEqual({ tipo: 'TOTAL', anticipo: 350000, saldo: 0 });
  });
  it.each([[101, 50, 51, 50], [2999, 33.33, 1000, 1999], [100, 100, 100, 0]])
    ('redondea %i al %s y conserva la suma exacta', (total, porcentaje, anticipo, saldo) => {
      expect(distribuirPago(total, porcentaje)).toEqual({ tipo: 'ANTICIPO', anticipo, saldo });
      expect(anticipo + saldo).toBe(total);
    });
  it('rechaza anticipo de cero pesos y parámetros fuera del contrato', () => {
    expect(() => distribuirPago(1, 1)).toThrow();
    expect(() => distribuirPago(100, 101)).toThrow();
    expect(() => distribuirPago(100, 1.234)).toThrow();
  });
  it('resta días calendario conservando la hora de la primera franja', () => {
    expect(vencimientoSaldo(new Date('2026-12-03T14:00:00-05:00'), 3).toISOString()).toBe('2026-11-30T19:00:00.000Z');
  });
});

describe('Reembolso de lo realmente pagado', () => {
  it('solo anticipo: nunca reembolsa el total cotizado', () => {
    expect(repartirReembolso([{ id: 'a', tipo: 'ANTICIPO', valor: 30000 }], 100)).toEqual({
      valorPagado: 30000, valorReembolso: 30000, reparto: [{ ordenPagoId: 'a', valor: 30000 }],
    });
  });
  it('anticipo y saldo: reparte primero SALDO y luego ANTICIPO, sin exceder cada pago', () => {
    const r = repartirReembolso([{ id: 'a', tipo: 'ANTICIPO', valor: 70 }, { id: 's', tipo: 'SALDO', valor: 30 }], 50);
    expect(r).toEqual({ valorPagado: 100, valorReembolso: 50, reparto: [{ ordenPagoId: 's', valor: 30 }, { ordenPagoId: 'a', valor: 20 }] });
  });
  it('TOTAL conserva la política y se redondea una sola vez', () => {
    expect(repartirReembolso([{ id: 't', tipo: 'TOTAL', valor: 200000 }], 50).valorReembolso).toBe(100000);
    const r = repartirReembolso([{ id: 'a', tipo: 'ANTICIPO', valor: 51 }, { id: 's', tipo: 'SALDO', valor: 50 }], 50);
    expect(r.valorReembolso).toBe(51); expect(r.reparto.reduce((suma, p) => suma + p.valor, 0)).toBe(51);
    expect(r.reparto).toEqual([{ ordenPagoId: 's', valor: 50 }, { ordenPagoId: 'a', valor: 1 }]);
  });
});
