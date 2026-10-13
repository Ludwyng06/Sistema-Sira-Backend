import { describe, expect, it } from 'vitest';
import { evaluarAforo, ordenarPorAjuste } from './aforo.js';

describe('evaluarAforo (RN-18)', () => {
  it('bloquea cuando los asistentes superan la capacidad', () => {
    expect(evaluarAforo(40, 55).nivel).toBe('NO_CABE');
  });

  it('acepta exactamente la capacidad', () => {
    expect(evaluarAforo(40, 40).nivel).toBe('ADECUADO');
  });

  it('advierte cuando un espacio grande queda desproporcionado', () => {
    const r = evaluarAforo(300, 30);
    expect(r.nivel).toBe('SOBRA_ESPACIO');
    expect(r.mensaje).toContain('300');
  });

  it('no advierte sobre espacios pequeños aunque sobre espacio', () => {
    expect(evaluarAforo(40, 5).nivel).toBe('ADECUADO');
  });

  it('rechaza valores inválidos', () => {
    expect(() => evaluarAforo(0, 10)).toThrow();
    expect(() => evaluarAforo(40, 0)).toThrow();
  });
});

describe('ordenarPorAjuste', () => {
  it('pone primero el espacio que mejor se ajusta y al final los que no caben', () => {
    const espacios = [
      { codigo: 'AUD', capacidadPersonas: 300 },
      { codigo: 'A-101', capacidadPersonas: 25 },
      { codigo: 'A-201', capacidadPersonas: 40 },
      { codigo: 'B-104', capacidadPersonas: 60 },
    ];
    expect(ordenarPorAjuste(espacios, 35).map((e) => e.codigo)).toEqual([
      'A-201',
      'B-104',
      'AUD',
      'A-101',
    ]);
  });
});
