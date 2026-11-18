import { describe, expect, it } from 'vitest';
import { formatearPesos } from './pesos.js';

describe('formatearPesos', () => {
  it('usa símbolo y puntos de miles, sin espacios', () => {
    expect(formatearPesos(333_000)).toBe('$333.000');
    expect(formatearPesos(1_250_000)).toBe('$1.250.000');
    expect(formatearPesos(0)).toBe('$0');
  });
});
