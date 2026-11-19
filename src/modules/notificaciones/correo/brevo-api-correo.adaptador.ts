import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import type { CorreoPort, MensajeCorreo } from './correo.port.js';

@Injectable()
export class BrevoApiCorreoAdaptador implements CorreoPort {
  private readonly logger = new Logger(BrevoApiCorreoAdaptador.name);
  private readonly apiKey: string;
  private readonly remitente: { name: string; email: string };

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('BREVO_API_KEY')?.trim() ?? '';
    if (!this.apiKey) {
      throw new Error('BREVO_API_KEY es obligatoria cuando CORREO_PROVEEDOR=brevo-api.');
    }
    const remitente = config.getOrThrow<string>('CORREO_REMITENTE').trim();
    const partes = /^(.*?)\s*<([^<>]+)>$/.exec(remitente);
    const email = partes ? partes[2].trim() : remitente;
    this.remitente = { name: partes ? partes[1].trim() : email, email };
  }

  async enviar(mensaje: MensajeCorreo): Promise<void> {
    try {
      const respuesta = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': this.apiKey,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: this.remitente,
          to: [{ email: mensaje.para }],
          subject: mensaje.asunto,
          htmlContent: mensaje.html,
          textContent: mensaje.texto,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!respuesta.ok) {
        throw new Error(`Brevo HTTP ${respuesta.status}: ${await respuesta.text()}`);
      }
    } catch (error) {
      const detalle = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      const detalleSeguro = detalle.split(this.apiKey).join('[REDACTADO]');
      this.logger.error(`Error técnico al enviar correo: ${detalleSeguro}`);
      throw new ErrorDominio(
        'CORREO_NO_ENVIADO',
        'No pudimos enviar el correo. Intenta de nuevo en unos minutos.',
        503,
      );
    }
  }
}
