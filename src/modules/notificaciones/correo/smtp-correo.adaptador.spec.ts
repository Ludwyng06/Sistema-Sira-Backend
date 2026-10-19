import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import { SmtpCorreoAdaptador } from './smtp-correo.adaptador.js';

const { sendMail, close, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn<(mensaje: Record<string, string>) => Promise<void>>();
  const close = vi.fn();
  const createTransport = vi.fn(
    (_opciones: Record<string, unknown>) => ({ sendMail, close }),
  );
  return { sendMail, close, createTransport };
});

vi.mock('nodemailer', () => ({
  default: { createTransport },
}));

function crearAdaptador(puerto: number, usuario = '', contrasena = ''): SmtpCorreoAdaptador {
  const config = new ConfigService({
    NODE_ENV: 'test',
    PORT: 3001,
    TZ: 'UTC',
    FRONTEND_URL: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://localhost/sira',
    JWT_ACCESS_SECRETO: 'secreto-access',
    JWT_ACCESS_EXPIRA: '15m',
    JWT_REFRESH_SECRETO: 'secreto-refresh',
    JWT_REFRESH_DIAS: 7,
    REDIS_URL: 'redis://localhost:6379',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'sira',
    S3_ACCESS_KEY: 'access',
    S3_SECRET_KEY: 'secret',
    S3_URL_PUBLICA: 'http://localhost:9000/sira',
    SMTP_HOST: 'localhost',
    SMTP_PORT: puerto,
    SMTP_USUARIO: usuario,
    SMTP_CONTRASENA: contrasena,
    CORREO_REMITENTE: 'SIRA <no-reply@sira.test>',
  });
  return new SmtpCorreoAdaptador(config);
}

describe('SmtpCorreoAdaptador', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMail.mockResolvedValue(undefined);
    createTransport.mockImplementation(() => ({ sendMail, close }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('configura SMTP sin autenticación para Mailpit en el puerto 1025', () => {
    crearAdaptador(1025);

    expect(createTransport).toHaveBeenCalledWith({
      host: 'localhost',
      port: 1025,
      secure: false,
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
    });
  });

  it('configura autenticación y conexión segura para el puerto 465', () => {
    crearAdaptador(465, 'correo@sira.test', 'contrasena-segura');

    expect(createTransport).toHaveBeenCalledWith({
      host: 'localhost',
      port: 465,
      secure: true,
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
      auth: { user: 'correo@sira.test', pass: 'contrasena-segura' },
    });
  });

  it('envía el remitente y los campos del mensaje', async () => {
    const adaptador = crearAdaptador(1025);
    const mensaje = {
      para: 'persona@ejemplo.com',
      asunto: 'Verifica tu correo',
      html: '<p>Tu código es 123456</p>',
      texto: 'Tu código es 123456',
    };

    await adaptador.enviar(mensaje);

    expect(sendMail).toHaveBeenCalledWith({
      from: 'SIRA <no-reply@sira.test>',
      to: mensaje.para,
      subject: mensaje.asunto,
      html: mensaje.html,
      text: mensaje.texto,
    });
  });

  it('registra el error técnico sin la contraseña y lanza un error seguro 503', async () => {
    const adaptador = crearAdaptador(465, 'correo@sira.test', 'contrasena-secreta');
    const errorTecnico = new Error('SMTP rechazó la contrasena-secreta');
    const registro = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    sendMail.mockRejectedValue(errorTecnico);

    let error: unknown;
    try {
      await adaptador.enviar({
        para: 'persona@ejemplo.com',
        asunto: 'Verificación',
        html: '<p>Código</p>',
        texto: 'Código',
      });
    } catch (capturado) {
      error = capturado;
    }

    expect(error).toBeInstanceOf(ErrorDominio);
    expect(error).toMatchObject({
      codigo: 'CORREO_NO_ENVIADO',
      status: 503,
      message: 'No pudimos enviar el correo. Intenta de nuevo en unos minutos.',
    });
    expect((error as Error).message).not.toContain('SMTP rechazó');
    expect(registro).toHaveBeenCalledWith(
      'Error técnico al enviar correo: Error: SMTP rechazó la [REDACTADO]',
    );
  });

  it('cierra el transporte al destruir el módulo', () => {
    const adaptador = crearAdaptador(1025);

    adaptador.onModuleDestroy();

    expect(close).toHaveBeenCalledOnce();
  });
});
