import { describe, expect, it } from 'vitest';
import type { FilaConciliacionDto } from '../dto/conciliacion.dto.js';
import { compararExtracto, corteBogota, leerExtracto } from './conciliacion.js';

const fecha = '2026-11-13';
const orden = (cambios: Partial<FilaConciliacionDto> = {}): FilaConciliacionDto => ({ ordenId: 'orden-1', referencia: 'OP-2026-1',
  proveedor: 'WOMPI', medio: 'PASARELA', estado: 'APROBADA', valor: 10000, transaccionExternaId: 'tx-1', pagadoEn: '2026-11-13T12:00:00Z', ...cambios });
describe('Conciliación: día Bogotá y diferencias exactas', () => {
  it('el día inicia a las 05:00Z y termina al día siguiente sin incluirlo', () => {
    const { desde, hasta } = corteBogota(fecha);
    expect(desde.toISOString()).toBe('2026-11-13T05:00:00.000Z');
    expect(hasta.toISOString()).toBe('2026-11-14T05:00:00.000Z');
    expect(new Date('2026-11-13T04:59:59.999Z') < desde).toBe(true);
    expect(new Date('2026-11-14T04:59:59.999Z') < hasta).toBe(true);
  });
  it('maneja fin de año y rechaza días inexistentes', () => {
    expect(corteBogota('2026-12-31').hasta.toISOString()).toBe('2027-01-01T05:00:00.000Z');
    expect(() => corteBogota('2026-02-30')).toThrow();
  });
  it('VALOR conserva los dos montos enteros', () => {
    expect(compararExtracto([orden()], [{ referencia: 'OP-2026-1', valor: 9000, fecha }]))
      .toEqual([expect.objectContaining({ tipo: 'VALOR', valorSistema: 10000, valorExtracto: 9000 })]);
  });
  it('SIN_ORDEN muestra valorSistema null', () => {
    expect(compararExtracto([], [{ referencia: 'desconocida', valor: 1, fecha }]))
      .toEqual([expect.objectContaining({ tipo: 'SIN_ORDEN', valorSistema: null, valorExtracto: 1 })]);
  });
  it('SIN_EXTRACTO solo aplica a pagos aprobados', () => {
    expect(compararExtracto([orden(), orden({ referencia: 'pendiente', estado: 'PENDIENTE' })], []))
      .toEqual([expect.objectContaining({ tipo: 'SIN_EXTRACTO', valorExtracto: null })]);
  });
  it('ESTADO señala un abono bancario pendiente o fuera del corte del sistema', () => {
    expect(compararExtracto([orden({ estado: 'PENDIENTE' })], [{ referencia: 'OP-2026-1', valor: 10000, fecha }])[0]?.tipo).toBe('ESTADO');
    expect(compararExtracto([], [{ referencia: 'OP-2026-1', valor: 10000, fecha }], [orden()])[0]?.tipo).toBe('ESTADO');
  });
  it('CSV admite BOM y comillas, y rechaza duplicados, fracciones y otra fecha', () => {
    expect(leerExtracto(Buffer.from('\uFEFFreferencia,valor,fecha\r\n"OP-2026-1",10000,2026-11-13\r\n'), fecha))
      .toEqual([{ referencia: 'OP-2026-1', valor: 10000, fecha }]);
    for (const filas of ['OP-1,10.5,2026-11-13', 'OP-1,10,2026-11-14', 'OP-1,10,2026-11-13\nOP-1,10,2026-11-13']) {
      expect(() => leerExtracto(Buffer.from(`referencia,valor,fecha\n${filas}`), fecha)).toThrow();
    }
  });
});
