import { describe, expect, it } from 'vitest';
import {
  leerCookieRefresco,
  NOMBRE_COOKIE_REFRESCO,
  opcionesCookieRefresco,
  opcionesLimpiarCookieRefresco,
} from './cookie-refresco.js';

describe('leerCookieRefresco', () => {
  it('usa el nombre sira_refresh', () => {
    expect(NOMBRE_COOKIE_REFRESCO).toBe('sira_refresh');
  });

  it('lee la cookie entre otras', () => {
    expect(leerCookieRefresco('tema=oscuro; sira_refresh=abc123; otra=1')).toBe('abc123');
  });

  it('tolera espacios alrededor', () => {
    expect(leerCookieRefresco('  sira_refresh =  abc123  ;x=1')).toBe('abc123');
  });

  it('decodifica el valor', () => {
    expect(leerCookieRefresco('sira_refresh=a%2Bb%3D%3D')).toBe('a+b==');
  });

  it('devuelve null si falta, está vacía o no hay cabecera', () => {
    expect(leerCookieRefresco(undefined)).toBeNull();
    expect(leerCookieRefresco('')).toBeNull();
    expect(leerCookieRefresco('otra=1; sira_refresh_x=2')).toBeNull();
    expect(leerCookieRefresco('sira_refresh=')).toBeNull();
  });

  it('no falla con codificación inválida', () => {
    expect(leerCookieRefresco('sira_refresh=%E0%A4%A')).toBe('%E0%A4%A');
  });
});

describe('opciones de la cookie', () => {
  const expira = new Date('2026-10-22T00:00:00.000Z');

  it('marca secure solo en producción', () => {
    expect(opcionesCookieRefresco(true, expira).secure).toBe(true);
    expect(opcionesCookieRefresco(false, expira).secure).toBe(false);
  });

  it('fija httpOnly, lax, ruta /api/auth y expiración', () => {
    expect(opcionesCookieRefresco(true, expira)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/api/auth',
      expires: expira,
    });
  });

  it('las opciones para limpiar no llevan expires', () => {
    const opciones = opcionesLimpiarCookieRefresco(false);
    expect(opciones).toEqual({ httpOnly: true, secure: false, sameSite: 'lax', path: '/api/auth' });
    expect(opciones).not.toHaveProperty('expires');
  });
});
