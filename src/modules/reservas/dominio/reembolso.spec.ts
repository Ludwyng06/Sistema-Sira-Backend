import { describe, expect, it } from 'vitest';
import { motivoReembolso } from './reembolso.js';

describe('motivoReembolso', () => {
  it('describe la cancelación del solicitante con su antelación', () => {
    expect(motivoReembolso(false, 50, 7)).toBe('Cancelación por el solicitante: 50 % según política (7 días de antelación)');
    expect(motivoReembolso(false, 50, 1)).toContain('(1 día de antelación)');
  });

  it('describe la cancelación institucional', () => {
    expect(motivoReembolso(true, 100, 3)).toBe('Cancelación por la institución: 100 %');
  });

  it('sin antelación conocida la omite', () => {
    expect(motivoReembolso(false, 50, null)).toBe('Cancelación por el solicitante: 50 % según política');
  });
});
