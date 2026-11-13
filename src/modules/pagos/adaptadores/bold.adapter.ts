import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import type { CrearTransaccionEntrada, EstadoTransaccion, EventoInterpretado, PasarelaPort } from '../puertos/pasarela.port.js';

type Objeto = Record<string, unknown>;
function invalido(): never {
  throw new ErrorDominio('RESPUESTA_PASARELA_INVALIDA', 'La respuesta de Bold no es válida.', 502);
}
function objeto(valor: unknown): Objeto {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return invalido();
  return valor as Objeto;
}
function texto(valor: unknown): string {
  if (typeof valor !== 'string' || !valor.trim()) return invalido();
  return valor;
}

@Injectable()
export class BoldAdapter implements PasarelaPort {
  readonly proveedor = 'BOLD' as const;
  constructor(private readonly config: ConfigService) {}

  private ambiente(): 'test' | 'prod' {
    const ambiente = this.config.get<string>('BOLD_AMBIENTE') || 'test';
    if (ambiente !== 'test' && ambiente !== 'prod') {
      throw new ErrorDominio('PASARELA_SIN_CONFIGURAR', 'BOLD_AMBIENTE debe ser test o prod.', 503);
    }
    return ambiente;
  }

  private secreto(clave: string): string {
    const valor = this.config.get<string>(clave);
    if (typeof valor !== 'string' || !valor.trim()) {
      throw new ErrorDominio('PASARELA_SIN_CONFIGURAR', 'Bold no está configurado.', 503);
    }
    return valor;
  }

  /** Atributos para el script oficial; no contiene la llave secreta ni HTML ejecutable.
   * https://developers.bold.co/pagos-en-linea/boton-de-pagos/integracion-manual/integracion-manual
   */
  prepararBoton(entrada: CrearTransaccionEntrada): Record<string, string> {
    this.ambiente();
    if (!Number.isSafeInteger(entrada.valorPesos) || entrada.valorPesos <= 0 || entrada.moneda !== 'COP') {
      throw new ErrorDominio('VALOR_INVALIDO', 'El valor del pago no es válido.', 422);
    }
    if (!/^[a-zA-Z0-9_-]{1,60}$/.test(entrada.referencia)) {
      throw new ErrorDominio('REFERENCIA_INVALIDA', 'La referencia Bold no es válida.', 422);
    }
    let retorno: URL;
    try { retorno = new URL(entrada.urlRetorno); } catch {
      throw new ErrorDominio('URL_RETORNO_INVALIDA', 'La URL de retorno debe usar HTTPS.', 422);
    }
    if (retorno.protocol !== 'https:' || retorno.username || retorno.password) {
      throw new ErrorDominio('URL_RETORNO_INVALIDA', 'La URL de retorno debe usar HTTPS.', 422);
    }
    // Bold recibe pesos, sin multiplicar por 100; SHA256(referencia + monto + divisa + secreto).
    const firma = createHash('sha256').update(`${entrada.referencia}${entrada.valorPesos}${entrada.moneda}${this.secreto('BOLD_LLAVE_SECRETA')}`, 'utf8').digest('hex');
    return {
      'data-bold-button': '', 'data-api-key': this.secreto('BOLD_LLAVE_IDENTIDAD'),
      'data-order-id': entrada.referencia, 'data-amount': String(entrada.valorPesos),
      'data-currency': entrada.moneda, 'data-integrity-signature': firma,
      'data-redirection-url': retorno.href, 'data-description': entrada.descripcion,
      'data-customer-data': JSON.stringify({ email: entrada.correoPagador }),
    };
  }

  async crearTransaccion(entrada: CrearTransaccionEntrada): Promise<{ urlCheckout: string; transaccionExternaId: string | null }> {
    this.prepararBoton(entrada);
    // no verificado: URL directa del botón. El SDK genera la navegación, no el backend.
    // No sustituir por LNK_: cambia la referencia recibida en el webhook.
    throw new ErrorDominio('INTEGRACION_NO_VERIFICADA', 'Falta el puente del frontend para abrir el botón Bold con los atributos de prepararBoton.', 501);
  }

  verificarFirmaWebhook(crudo: string, cabeceras: Record<string, string>): boolean {
    // https://developers.bold.co/webhook: HMAC-SHA256(base64(cuerpo crudo)), salida HEX.
    // La misma documentación exige secreto vacío SOLO para el webhook de pruebas.
    try {
      const firma = cabeceras['x-bold-signature'];
      if (typeof firma !== 'string' || !/^[a-f0-9]{64}$/i.test(firma)) return false;
      const llave = this.ambiente() === 'test' ? '' : this.secreto('BOLD_LLAVE_SECRETA');
      const esperada = createHmac('sha256', llave).update(Buffer.from(crudo, 'utf8').toString('base64')).digest();
      return timingSafeEqual(esperada, Buffer.from(firma, 'hex'));
    } catch { return false; }
  }

  interpretarEvento(cuerpo: unknown): EventoInterpretado {
    this.ambiente();
    // Esquema y tipos: https://developers.bold.co/webhook
    const evento = objeto(cuerpo);
    const datos = objeto(evento.data);
    const monto = objeto(datos.amount);
    const estados: Record<string, EstadoTransaccion> = {
      SALE_APPROVED: 'APROBADA', SALE_REJECTED: 'RECHAZADA', VOID_APPROVED: 'ANULADA',
    };
    const tipo = texto(evento.type);
    // VOID_REJECTED rechaza una anulación, NO rechaza la venta original.
    if (!Object.hasOwn(estados, tipo)) {
      throw new ErrorDominio('EVENTO_NO_SOPORTADO', 'El evento Bold no determina el estado del pago.', 422);
    }
    if (monto.currency !== 'COP' || typeof monto.total !== 'number' ||
        !Number.isSafeInteger(monto.total) || monto.total <= 0) return invalido();
    const id = texto(datos.payment_id);
    if (texto(evento.subject) !== id) return invalido();
    // Los ejemplos oficiales expresan time en nanosegundos; truncar solo para Date.
    if (typeof evento.time !== 'number' || !Number.isFinite(evento.time) || evento.time <= 0) return invalido();
    const milisegundos = Math.trunc(evento.time / 1_000_000);
    const ocurrioEn = new Date(milisegundos);
    if (!Number.isSafeInteger(milisegundos) || !Number.isFinite(ocurrioEn.getTime())) return invalido();
    return { idEventoExterno: texto(evento.id), referencia: texto(objeto(datos.metadata).reference),
      transaccionExternaId: id, estado: estados[tipo], valorPesos: monto.total, ocurrioEn };
  }

  private async consultar(id: string, porReferencia: boolean): Promise<EventoInterpretado | null> {
    texto(id);
    this.ambiente();
    // Endpoint por ID y referencia, autenticación y respuesta { notifications: [] }:
    // https://developers.bold.co/webhook (Consulta de notificaciones).
    // Test y prod usan la MISMA URL con llaves distintas, no hay host sandbox documentado:
    // https://developers.bold.co/pagos-en-linea/boton-de-pagos/ambiente-pruebas
    const ruta = `https://integrations.api.bold.co/payments/webhook/notifications/${encodeURIComponent(id)}${porReferencia ? '?is_external_reference=true' : ''}`;
    const llave = this.secreto('BOLD_LLAVE_IDENTIDAD');
    let cuerpo: unknown;
    try {
      const respuesta = await fetch(ruta, { headers: { Authorization: `x-api-key ${llave}` },
        redirect: 'error', signal: AbortSignal.timeout(8000) });
      if (!respuesta.ok) throw new Error('HTTP Bold no exitoso.');
      cuerpo = await respuesta.json();
    } catch {
      throw new ErrorDominio('PASARELA_NO_DISPONIBLE', 'No pudimos consultar el pago en Bold. Intenta más tarde.', 503);
    }
    const notificaciones = objeto(cuerpo).notifications;
    if (!Array.isArray(notificaciones)) return invalido();
    if (!notificaciones.length) return null;
    const eventos = notificaciones.map((fila: unknown) => {
      const evento = this.interpretarEvento(fila);
      if ((porReferencia ? evento.referencia : evento.transaccionExternaId) !== id) return invalido();
      return { evento, tiempo: objeto(fila).time as number };
    });
    // No escoger un pago arbitrario si la referencia se reutilizó.
    if (new Set(eventos.map(({ evento }) => evento.transaccionExternaId)).size !== 1) {
      throw new ErrorDominio('REFERENCIA_AMBIGUA', 'La referencia Bold tiene varios pagos; requiere conciliación.', 409);
    }
    eventos.sort((a, b) => b.tiempo - a.tiempo || a.evento.idEventoExterno.localeCompare(b.evento.idEventoExterno));
    const ultimo = eventos[0];
    // Igual timestamp y distinto resultado: no adivinar el orden de dos eventos.
    if (eventos.some(({ evento, tiempo }) => tiempo === ultimo.tiempo &&
        (evento.estado !== ultimo.evento.estado || evento.valorPesos !== ultimo.evento.valorPesos ||
         evento.referencia !== ultimo.evento.referencia))) {
      throw new ErrorDominio('EVENTOS_AMBIGUOS', 'Bold reportó eventos contradictorios; requiere conciliación.', 409);
    }
    return ultimo.evento;
  }

  async consultarTransaccion(id: string): Promise<EventoInterpretado> {
    const evento = await this.consultar(id, false);
    if (!evento) throw new ErrorDominio('TRANSACCION_NO_ENCONTRADA', 'Bold todavía no reporta la transacción.', 404);
    return evento;
  }

  async consultarPorReferencia(referencia: string): Promise<EventoInterpretado | null> {
    return this.consultar(referencia, true);
  }

  async consultarEstado(id: string): Promise<EstadoTransaccion> {
    return (await this.consultarTransaccion(id)).estado;
  }

  async reembolsar(_id: string, _valorPesos?: number): Promise<{ id: string; estado: string }> {
    // no verificado: reembolso del producto Botón; no mezclar con API Pagos en Línea.
    throw new ErrorDominio('REEMBOLSO_NO_SOPORTADO', 'Tramita el reembolso Bold con tesorería.', 501);
  }
}
