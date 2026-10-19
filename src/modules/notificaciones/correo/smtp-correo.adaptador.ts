import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import type { CorreoPort, MensajeCorreo } from './correo.port.js';

/**
 * Tiempos de espera cortos: el correo se envía en la misma petición que cambia el estado de una solicitud y
 * un servidor SMTP lento no debe dejar colgado al usuario (el predeterminado de nodemailer es de 2 minutos).
 */
export const TIEMPOS_SMTP = {
  connectionTimeout: 5_000,
  greetingTimeout: 5_000,
  socketTimeout: 10_000,
} as const;

@Injectable()
export class SmtpCorreoAdaptador implements CorreoPort, OnModuleDestroy {
  private readonly logger = new Logger(SmtpCorreoAdaptador.name);
  private readonly transporte: ReturnType<typeof nodemailer.createTransport>;

  constructor(private readonly config: ConfigService) {
    const puerto = this.config.getOrThrow<number>('SMTP_PORT');
    const usuario = this.config.getOrThrow<string>('SMTP_USUARIO');
    this.transporte = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST'),
      port: puerto,
      secure: puerto === 465,
      ...TIEMPOS_SMTP,
      ...(usuario.trim()
        ? {
            auth: {
              user: usuario,
              pass: this.config.getOrThrow<string>('SMTP_CONTRASENA'),
            },
          }
        : {}),
    });
  }

  async enviar(mensaje: MensajeCorreo): Promise<void> {
    try {
      await this.transporte.sendMail({
        from: this.config.getOrThrow<string>('CORREO_REMITENTE'),
        to: mensaje.para,
        subject: mensaje.asunto,
        html: mensaje.html,
        text: mensaje.texto,
      });
    } catch (error) {
      const detalle =
        error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      const contrasena = this.config.getOrThrow<string>('SMTP_CONTRASENA');
      const detalleSeguro = contrasena
        ? detalle.split(contrasena).join('[REDACTADO]')
        : detalle;
      this.logger.error(`Error técnico al enviar correo: ${detalleSeguro}`);
      throw new ErrorDominio(
        'CORREO_NO_ENVIADO',
        'No pudimos enviar el correo. Intenta de nuevo en unos minutos.',
        503,
      );
    }
  }

  onModuleDestroy(): void {
    this.transporte.close();
  }
}
