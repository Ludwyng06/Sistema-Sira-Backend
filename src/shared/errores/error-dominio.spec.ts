import { describe, expect, it } from 'vitest';
import { noEncontrado, noImplementado } from './error-dominio.js';

describe('noImplementado', () => {
  it('identifica la funcionalidad no implementada con HTTP 501', () => {
    const error = noImplementado('El registro de usuarios');

    expect(error.codigo).toBe('NO_IMPLEMENTADO');
    expect(error.status).toBe(501);
    expect(error.message).toContain('El registro de usuarios');
  });
});

describe('noEncontrado', () => {
  it('mantiene el error 404 existente', () => {
    const error = noEncontrado('El recurso');

    expect(error.status).toBe(404);
    expect(error.codigo).toBe('NO_ENCONTRADO');
  });
});
