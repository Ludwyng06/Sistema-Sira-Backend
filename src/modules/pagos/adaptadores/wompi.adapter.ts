import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import type { CrearTransaccionEntrada, EstadoTransaccion, EventoInterpretado, PasarelaPort } from '../puertos/pasarela.port.js';

const ESTADOS: Record<string, EstadoTransaccion> = {
  APPROVED: 'APROBADA', DECLINED: 'RECHAZADA', PENDING: 'PENDIENTE', VOIDED: 'ANULADA', ERROR: 'ERROR',
};
type Objeto = Record<string, unknown>;
function objeto(valor: unknown): Objeto {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Objeto Wompi inválido.');
  return valor as Objeto;
}
function texto(valor: unknown): string {
  if (typeof valor !== 'string' || !valor) throw new Error('Texto Wompi inválido.');
  return valor;
}
export function sha256(valor: string): string {
  return createHash('sha256').update(valor, 'utf8').digest('hex');
}

@Injectable()
export class WompiAdapter implements PasarelaPort {
  readonly proveedor = 'WOMPI';
  constructor(private readonly config: ConfigService) {}

  private secreto(clave: string): string {
    const valor = this.config.get<string>(clave);
    if (!valor) throw new ErrorDominio('PASARELA_SIN_CONFIGURAR', 'La pasarela no está configurada.', 503);
    return valor;
  }

  async crearTransaccion(entrada: CrearTransaccionEntrada) {
    if (!Number.isSafeInteger(entrada.valorPesos) || entrada.valorPesos <= 0 ||
        !Number.isSafeInteger(entrada.valorPesos * 100) || entrada.moneda !== 'COP') {
      throw new ErrorDominio('VALOR_INVALIDO', 'El valor del pago no es válido.', 422);
    }
    const centavos = entrada.valorPesos * 100;
    const firma = sha256(`${entrada.referencia}${centavos}${entrada.moneda}${this.secreto('WOMPI_SECRETO_INTEGRIDAD')}`);
    const parametros = new URLSearchParams({
      'public-key': this.secreto('WOMPI_LLAVE_PUBLICA'), currency: entrada.moneda,
      'amount-in-cents': String(centavos), reference: entrada.referencia,
      'signature:integrity': firma, 'redirect-url': entrada.urlRetorno,
      'customer-data:email': entrada.correoPagador,
    });
    return { urlCheckout: `https://checkout.wompi.co/p/?${parametros}`, transaccionExternaId: null };
  }

  verificarFirmaWebhook(crudo: string, cabeceras: Record<string, string>): boolean {
    try {
      const evento = objeto(JSON.parse(crudo));
      if (evento.event !== 'transaction.updated' || evento.environment !== 'test') return false;
      const firma = objeto(evento.signature);
      if (!Array.isArray(firma.properties) || !firma.properties.length ||
          !Number.isSafeInteger(evento.timestamp) || Number(evento.timestamp) <= 0) return false;
      if (!['transaction.id', 'transaction.status', 'transaction.amount_in_cents'].every(
        (propiedad) => (firma.properties as unknown[]).includes(propiedad),
      )) return false;
      const valores = firma.properties.map((propiedad: unknown) => {
        let valor: unknown = evento.data;
        for (const parte of texto(propiedad).split('.')) {
          if (['__proto__', 'constructor', 'prototype'].includes(parte) || !Object.hasOwn(objeto(valor), parte)) {
            throw new Error('Propiedad de firma inexistente.');
          }
          valor = objeto(valor)[parte];
        }
        if (typeof valor !== 'string' && typeof valor !== 'number' && typeof valor !== 'boolean') {
          throw new Error('Propiedad de firma inválida.');
        }
        return String(valor);
      });
      const esperado = sha256(`${valores.join('')}${evento.timestamp}${this.secreto('WOMPI_SECRETO_EVENTOS')}`);
      const recibido = cabeceras['x-event-checksum'] || texto(firma.checksum);
      if (!/^[a-f0-9]{64}$/i.test(recibido)) return false;
      return timingSafeEqual(Buffer.from(esperado, 'hex'), Buffer.from(recibido, 'hex'));
    } catch {
      return false;
    }
  }

  interpretarEvento(cuerpo: unknown): EventoInterpretado {
    const evento = objeto(cuerpo);
    if (evento.event !== 'transaction.updated' || evento.environment !== 'test') throw new Error('Evento Wompi no soportado.');
    const interpretado = this.interpretarTransaccion(objeto(evento.data).transaction);
    // Wompi no suministra id de evento: identidad estable sobre datos firmados.
    return { ...interpretado,
      idEventoExterno: sha256(`${interpretado.transaccionExternaId}:${interpretado.estado}:${evento.timestamp}:${interpretado.valorPesos}`),
      ocurrioEn: new Date(Number(evento.timestamp) * 1000) };
  }

  private interpretarTransaccion(valor: unknown): EventoInterpretado {
    const transaccion = objeto(valor);
    const centavos = transaccion.amount_in_cents;
    const estadoProveedor = texto(transaccion.status);
    const estado = Object.hasOwn(ESTADOS, estadoProveedor) ? ESTADOS[estadoProveedor] : undefined;
    if (transaccion.currency !== 'COP' || typeof centavos !== 'number' || !Number.isSafeInteger(centavos) ||
        centavos <= 0 || centavos % 100 !== 0 || !estado) throw new Error('Transacción Wompi inválida.');
    return { idEventoExterno: '', referencia: texto(transaccion.reference), estado,
      valorPesos: centavos / 100, transaccionExternaId: texto(transaccion.id), ocurrioEn: new Date() };
  }

  async consultarTransaccion(id: string): Promise<EventoInterpretado> {
    const base = this.config.get<string>('WOMPI_URL_API') || 'https://sandbox.wompi.co/v1';
    if (base.replace(/\/$/, '') !== 'https://sandbox.wompi.co/v1') {
      throw new ErrorDominio('PASARELA_SIN_CONFIGURAR', 'Solo se admite Wompi sandbox.', 503);
    }
    const respuesta = await fetch(`${base.replace(/\/$/, '')}/transactions/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${this.secreto('WOMPI_LLAVE_PRIVADA')}` },
      signal: AbortSignal.timeout(8000), redirect: 'error',
    });
    if (!respuesta.ok) throw new ErrorDominio('PASARELA_NO_DISPONIBLE', 'No pudimos consultar el pago. Intenta más tarde.', 503);
    const transaccion = this.interpretarTransaccion(objeto(await respuesta.json()).data);
    if (transaccion.transaccionExternaId !== id) throw new Error('ID Wompi distinto al consultado.');
    return transaccion;
  }

  async consultarEstado(id: string): Promise<EstadoTransaccion> {
    return (await this.consultarTransaccion(id)).estado;
  }

  async reembolsar(_id: string, _valorPesos?: number): Promise<{ id: string; estado: string }> {
    throw new ErrorDominio('REEMBOLSO_NO_SOPORTADO', 'Reembolso no soportado en sandbox por este adaptador; tramítalo con tesorería.', 501);
  }
}
