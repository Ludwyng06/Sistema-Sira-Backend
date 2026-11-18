import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  crearLineaPeticion,
  registroPeticiones,
} from './registro-peticiones.js';

const peticion = (extra: Record<string, unknown> = {}) =>
  ({
    method: 'POST',
    originalUrl: '/api/auth/ingresar?correo=ana@itp.edu.co',
    headers: { 'x-correlation-id': 'corr-1', authorization: 'Bearer secreto' },
    ...extra,
  }) as unknown as Request;

describe('registro de peticiones', () => {
  it('arma la línea sin cadena de consulta ni cabeceras sensibles', () => {
    const linea = crearLineaPeticion(
      peticion({ user: { id: 'u-1' } }),
      200,
      12,
      new Date('2026-10-19T15:00:00.000Z'),
    );
    expect(linea).toEqual({
      nivel: 'info',
      momento: '2026-10-19T15:00:00.000Z',
      mensaje: 'peticion',
      metodo: 'POST',
      ruta: '/api/auth/ingresar',
      estado: 200,
      duracionMs: 12,
      correlacionId: 'corr-1',
      usuarioId: 'u-1',
    });
    expect(JSON.stringify(linea)).not.toContain('secreto');
    expect(JSON.stringify(linea)).not.toContain('ana@itp.edu.co');
  });

  it('el nivel sigue al estado HTTP y el usuario puede faltar', () => {
    expect(crearLineaPeticion(peticion(), 404, 1).nivel).toBe('warn');
    expect(crearLineaPeticion(peticion(), 503, 1).nivel).toBe('error');
    expect(crearLineaPeticion(peticion(), 200, 1).usuarioId).toBeNull();
    expect(
      crearLineaPeticion(peticion({ headers: {} }), 200, 1).correlacionId,
    ).toBeNull();
  });

  it('escribe una línea JSON cuando la respuesta termina', () => {
    const escribir = vi.fn();
    const res = Object.assign(new EventEmitter(), {
      statusCode: 201,
    }) as unknown as Response;
    const siguiente = vi.fn() as unknown as NextFunction;

    registroPeticiones(escribir)(peticion(), res, siguiente);
    expect(siguiente).toHaveBeenCalledOnce();
    expect(escribir).not.toHaveBeenCalled();

    res.emit('finish');
    expect(escribir).toHaveBeenCalledOnce();
    expect(JSON.parse(escribir.mock.calls[0]![0] as string)).toMatchObject({
      metodo: 'POST',
      ruta: '/api/auth/ingresar',
      estado: 201,
      correlacionId: 'corr-1',
    });
  });
});
