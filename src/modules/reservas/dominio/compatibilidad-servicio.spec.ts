import { describe, expect, it } from 'vitest';
import { servicioCompatible } from './compatibilidad-servicio.js';

describe('servicioCompatible', () => {
  it('sin restricción aplica a cualquier espacio', () => {
    expect(servicioCompatible([], ['AULA'])).toBe(true);
  });

  it('con restricción exige que algún espacio de la solicitud sea de un tipo permitido', () => {
    expect(servicioCompatible(['AUDITORIO', 'ZONA_VERDE'], ['AULA', 'AUDITORIO'])).toBe(true);
    expect(servicioCompatible(['AUDITORIO'], ['AULA', 'LABORATORIO'])).toBe(false);
  });

  it('con restricción y sin espacios no es compatible', () => {
    expect(servicioCompatible(['AUDITORIO'], [])).toBe(false);
  });
});
