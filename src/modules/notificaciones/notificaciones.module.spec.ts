import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrevoApiCorreoAdaptador } from './correo/brevo-api-correo.adaptador.js';
import { CORREO } from './correo/correo.port.js';
import { SmtpCorreoAdaptador } from './correo/smtp-correo.adaptador.js';
import { NotificacionesModule } from './notificaciones.module.js';
import { NotificacionesService } from './services/notificaciones.service.js';

const { createTransport, close } = vi.hoisted(() => {
  const close = vi.fn();
  return { close, createTransport: vi.fn(() => ({ sendMail: vi.fn(), close })) };
});
vi.mock('nodemailer', () => ({ default: { createTransport } }));

const modulos: TestingModule[] = [];
async function entorno(valores: Record<string, unknown>) {
  const config = new ConfigService();
  vi.spyOn(config, 'get').mockImplementation((clave) => valores[String(clave)]);
  const modulo = await Test.createTestingModule({ imports: [NotificacionesModule] })
    .overrideProvider(ConfigService).useValue(config)
    .overrideProvider(NotificacionesService).useValue({})
    .compile();
  modulos.push(modulo);
  return modulo.get(CORREO);
}

afterEach(async () => {
  for (const modulo of modulos.splice(0)) await modulo.close();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('Selección del proveedor de correo', () => {
  it.each([undefined, 'smtp'])('usa SMTP para %j y cierra el transporte al destruir el módulo', async (proveedor) => {
    expect(await entorno({
      CORREO_PROVEEDOR: proveedor, SMTP_HOST: 'localhost', SMTP_PORT: 1025,
      SMTP_USUARIO: '', SMTP_CONTRASENA: '', CORREO_REMITENTE: 'sira@ejemplo.com',
    })).toBeInstanceOf(SmtpCorreoAdaptador);
    expect(createTransport).toHaveBeenCalledOnce();
    await modulos.pop()!.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it.each(['brevo-api', ' brevo-api '])('selecciona %s sin configurar ni crear transporte SMTP', async (proveedor) => {
    expect(await entorno({
      CORREO_PROVEEDOR: proveedor, BREVO_API_KEY: 'clave-de-prueba',
      CORREO_REMITENTE: 'SIRA <sira@ejemplo.com>',
    })).toBeInstanceOf(BrevoApiCorreoAdaptador);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it.each([undefined, null, '', '   '])('falla al arrancar Brevo sin una clave válida: %j', async (clave) => {
    await expect(entorno({ CORREO_PROVEEDOR: 'brevo-api', BREVO_API_KEY: clave }))
      .rejects.toThrow('BREVO_API_KEY es obligatoria cuando CORREO_PROVEEDOR=brevo-api.');
    expect(createTransport).not.toHaveBeenCalled();
  });

  it.each(['otro', '', null])('rechaza proveedor desconocido %j', async (proveedor) => {
    await expect(entorno({ CORREO_PROVEEDOR: proveedor }))
      .rejects.toThrow('CORREO_PROVEEDOR debe ser smtp o brevo-api.');
    expect(createTransport).not.toHaveBeenCalled();
  });
});
