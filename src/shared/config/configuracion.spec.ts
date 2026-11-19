import { describe, expect, it } from 'vitest';
import { validarConfiguracion } from './configuracion.js';

const base = {
  FRONTEND_URL: 'https://sira.example.com',
  DATABASE_URL: 'postgresql://ejemplo',
  JWT_ACCESS_SECRETO: 'access-de-prueba-01234567890123456789',
  JWT_REFRESH_SECRETO: 'refresh-de-prueba-01234567890123456789',
  SMTP_HOST: 'localhost',
  CORREO_REMITENTE: 'sira@example.com',
};

describe('Configuración de despliegue', () => {
  it.each(['development', 'production'])('permite arrancar sin Redis en %s', (NODE_ENV) => {
    expect(validarConfiguracion({ ...base, NODE_ENV }).REDIS_URL).toBe('');
  });

  it('permite dejar REDIS_URL vacía', () => {
    expect(validarConfiguracion({ ...base, REDIS_URL: '' }).REDIS_URL).toBe('');
  });

  it('conserva REDIS_URL cuando se proporciona', () => {
    const REDIS_URL = 'redis://localhost:6379';
    expect(validarConfiguracion({ ...base, REDIS_URL }).REDIS_URL).toBe(REDIS_URL);
  });

  it('usa el puerto inyectado por Cloud Run como número', () => {
    expect(validarConfiguracion({ ...base, PORT: '8080' }).PORT).toBe(8080);
  });

  it('conserva el puerto local predeterminado cuando no se inyecta PORT', () => {
    expect(validarConfiguracion(base).PORT).toBe(3001);
  });

  it('rechaza un puerto que no sea numérico', () => {
    expect(() => validarConfiguracion({ ...base, PORT: 'invalido' })).toThrow('PORT');
  });

  it('sigue exigiendo las variables obligatorias restantes', () => {
    expect(() => validarConfiguracion({ ...base, DATABASE_URL: '' })).toThrow('DATABASE_URL');
  });

  it('sigue rechazando secretos JWT débiles en producción sin Redis', () => {
    expect(() => validarConfiguracion({
      ...base,
      NODE_ENV: 'production',
      JWT_ACCESS_SECRETO: 'corto',
    })).toThrow('JWT_ACCESS_SECRETO');
  });
});
