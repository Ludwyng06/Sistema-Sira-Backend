import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validarConfiguracion } from '../config/configuracion.js';
import { AlmacenamientoModule } from './almacenamiento.module.js';
import { ALMACENAMIENTO } from './almacenamiento.port.js';
import { DiscoLocalAdapter } from './disco-local.adapter.js';
import { S3Adapter } from './s3.adapter.js';

const base = {
  FRONTEND_URL: 'http://localhost:3000', DATABASE_URL: 'postgresql://ejemplo',
  JWT_ACCESS_SECRETO: 'ejemplo-access', JWT_REFRESH_SECRETO: 'ejemplo-refresh',
  REDIS_URL: 'redis://localhost:6379', SMTP_HOST: 'localhost', CORREO_REMITENTE: 'sira@ejemplo.com',
};
const valoresS3 = {
  S3_ENDPOINT: 'https://proyecto.supabase.co/storage/v1/s3', S3_REGION: 'us-east-1',
  S3_BUCKET: 'archivos', S3_ACCESS_KEY: 'acceso-de-prueba', S3_SECRET_KEY: 'secreto-de-prueba',
};
const modulos: TestingModule[] = [];

async function entorno(valores: Record<string, unknown> = {}) {
  const config = new ConfigService();
  vi.spyOn(config, 'get').mockImplementation((clave) => valores[String(clave)]);
  const modulo = await Test.createTestingModule({ imports: [AlmacenamientoModule] })
    .overrideProvider(ConfigService).useValue(config).compile();
  modulos.push(modulo);
  return modulo.get(ALMACENAMIENTO);
}

afterEach(async () => { for (const modulo of modulos.splice(0)) await modulo.close(); });

describe('Selección de almacenamiento', () => {
  it('usa disco por defecto sin requerir S3', async () => {
    expect(await entorno()).toBeInstanceOf(DiscoLocalAdapter);
    expect(validarConfiguracion(base).ALMACENAMIENTO_PROVEEDOR).toBe('disco');
  });

  it('permite disco explícito aunque no haya credenciales S3', async () => {
    expect(await entorno({ ALMACENAMIENTO_PROVEEDOR: 'disco' })).toBeInstanceOf(DiscoLocalAdapter);
    expect(validarConfiguracion({ ...base, ALMACENAMIENTO_PROVEEDOR: 'disco' }).ALMACENAMIENTO_PROVEEDOR).toBe('disco');
  });

  it('resuelve S3 con las cinco variables y conserva la configuración', async () => {
    const entrada = { ...base, ...valoresS3, ALMACENAMIENTO_PROVEEDOR: 's3' };
    const configuracion = validarConfiguracion(entrada);
    expect(configuracion).toMatchObject({ ...valoresS3, ALMACENAMIENTO_PROVEEDOR: 's3' });
    expect(await entorno({ ...configuracion })).toBeInstanceOf(S3Adapter);
  });

  it.each(['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'])
    ('falla al arrancar si falta %s, sin aplicar valores predeterminados de disco', async (clave) => {
      for (const valor of [undefined, null, '', '   ']) {
        const entrada = { ...base, ...valoresS3, ALMACENAMIENTO_PROVEEDOR: 's3', [clave]: valor };
        expect(() => validarConfiguracion(entrada)).toThrow(clave);
        await expect(entorno(entrada)).rejects.toThrow(clave);
      }
    });

  it('enumera todas las variables faltantes sin exponer credenciales', async () => {
    const entrada = { ALMACENAMIENTO_PROVEEDOR: 's3', S3_SECRET_KEY: 'valor-que-no-debe-salir' };
    const mensaje = 'Faltan variables de almacenamiento para ALMACENAMIENTO_PROVEEDOR=s3: S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY.';
    expect(() => validarConfiguracion({ ...base, ...entrada })).toThrow(mensaje);
    await expect(entorno(entrada)).rejects.toThrow(mensaje);
  });

  it.each(['otro', '', null])('rechaza proveedor desconocido %j sin volver silenciosamente a disco', async (valor) => {
    const entrada = { ...base, ALMACENAMIENTO_PROVEEDOR: valor };
    expect(() => validarConfiguracion(entrada)).toThrow('ALMACENAMIENTO_PROVEEDOR debe ser disco o s3.');
    await expect(entorno(entrada)).rejects.toThrow('ALMACENAMIENTO_PROVEEDOR debe ser disco o s3.');
  });

  it('normaliza espacios en el proveedor igual que la configuración general', async () => {
    const configuracion = validarConfiguracion({ ...base, ...valoresS3, ALMACENAMIENTO_PROVEEDOR: ' s3 ' });
    expect(configuracion.ALMACENAMIENTO_PROVEEDOR).toBe('s3');
    expect(await entorno({ ...valoresS3, ALMACENAMIENTO_PROVEEDOR: ' s3 ' })).toBeInstanceOf(S3Adapter);
  });
});
