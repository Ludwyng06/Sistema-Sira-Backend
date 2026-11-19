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
  it.each([undefined, 'smtp'])('conserva la configuración SMTP con proveedor %j', (CORREO_PROVEEDOR) => {
    expect(validarConfiguracion({ ...base, CORREO_PROVEEDOR })).toMatchObject({
      CORREO_PROVEEDOR: 'smtp', SMTP_HOST: 'localhost', SMTP_PORT: 1025,
      SMTP_USUARIO: '', SMTP_CONTRASENA: '', BREVO_API_KEY: '',
    });
    expect(() => validarConfiguracion({ ...base, CORREO_PROVEEDOR, SMTP_HOST: undefined }))
      .toThrow('SMTP_HOST');
  });

  it('conserva el puerto y las credenciales SMTP explícitos', () => {
    expect(validarConfiguracion({ ...base, SMTP_PORT: '465', SMTP_USUARIO: 'usuario', SMTP_CONTRASENA: 'clave' }))
      .toMatchObject({ SMTP_PORT: 465, SMTP_USUARIO: 'usuario', SMTP_CONTRASENA: 'clave' });
    expect(() => validarConfiguracion({ ...base, SMTP_PORT: 'invalido' })).toThrow('SMTP_PORT');
  });

  it.each(['development', 'production'])('permite Brevo sin ninguna variable SMTP en %s', (NODE_ENV) => {
    const { SMTP_HOST: _host, ...sinSmtp } = base;
    expect(validarConfiguracion({
      ...sinSmtp, NODE_ENV, CORREO_PROVEEDOR: ' brevo-api ', BREVO_API_KEY: ' clave-prueba ',
    })).toMatchObject({ CORREO_PROVEEDOR: 'brevo-api', BREVO_API_KEY: 'clave-prueba', SMTP_HOST: '' });
  });

  it.each([undefined, null, '', '   '])('exige BREVO_API_KEY al seleccionar Brevo: %j', (BREVO_API_KEY) => {
    expect(() => validarConfiguracion({ ...base, CORREO_PROVEEDOR: 'brevo-api', BREVO_API_KEY }))
      .toThrow('BREVO_API_KEY');
  });

  it.each(['otro', '', null])('rechaza CORREO_PROVEEDOR inválido %j', (CORREO_PROVEEDOR) => {
    expect(() => validarConfiguracion({ ...base, CORREO_PROVEEDOR }))
      .toThrow('CORREO_PROVEEDOR debe ser smtp o brevo-api.');
  });

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
