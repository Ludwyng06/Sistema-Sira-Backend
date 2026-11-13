import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import type { CrearTransaccionEntrada, EstadoTransaccion, EventoInterpretado, PasarelaPort } from '../puertos/pasarela.port.js';

type Objeto = Record<string, unknown>;
function objeto(valor: unknown): Objeto {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Respuesta ePayco inválida.');
  return valor as Objeto;
}
function texto(valor: unknown): string {
  if ((typeof valor !== 'string' && typeof valor !== 'number') || String(valor) === '') throw new Error('Campo ePayco inválido.');
  return String(valor);
}
function hash(valor: string): string { return createHash('sha256').update(valor, 'utf8').digest('hex'); }
function iguales(a: string, b: string): boolean {
  return /^[a-f0-9]{64}$/i.test(a) && /^[a-f0-9]{64}$/i.test(b) && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/** Campos y estados: https://docs.epayco.com/docs/checkout-respuesta-y-confirmacion
 * https://docs.epayco.com/docs/checkout-tablas-de-datos */
@Injectable()
export class EpaycoAdapter implements PasarelaPort {
  readonly proveedor = 'EPAYCO' as const;
  constructor(private readonly config: ConfigService) {}

  private secreto(clave: string): string {
    const valor = this.config.get<string>(clave);
    if (!valor) throw new ErrorDominio('PASARELA_SIN_CONFIGURAR', 'Falta configurar ePayco.', 503);
    return valor;
  }
  private ambiente(): 'test' | 'prod' {
    const valor = this.config.get<string>('EPAYCO_AMBIENTE') || 'test';
    if (valor !== 'test' && valor !== 'prod') throw new Error('EPAYCO_AMBIENTE debe ser test o prod.');
    return valor;
  }
  private cuerpo(valor: unknown): Objeto {
    if (typeof valor !== 'string') return objeto(valor);
    if (valor.trimStart().startsWith('{')) return objeto(JSON.parse(valor));
    const resultado: Objeto = {};
    for (const [clave, dato] of new URLSearchParams(valor)) {
      if (Object.hasOwn(resultado, clave) || ['__proto__', 'constructor', 'prototype'].includes(clave)) throw new Error('Campo duplicado o inválido.');
      resultado[clave] = dato;
    }
    return resultado;
  }
  private pesos(valor: unknown): number {
    // ePayco expresa pesos decimales, no centavos. No se usa parseFloat ni redondeo.
    const cadena = texto(valor);
    if (!/^\d+(?:\.0{1,2})?$/.test(cadena)) throw new Error('El monto ePayco debe representar pesos enteros.');
    const pesos = Number(cadena.split('.')[0]);
    if (!Number.isSafeInteger(pesos) || pesos <= 0) throw new Error('Monto ePayco inválido.');
    return pesos;
  }
  private entornoValido(datos: Objeto): boolean {
    const valor = texto(datos.x_test_request).toLowerCase();
    return valor === (this.ambiente() === 'test' ? 'true' : 'false');
  }

  async crearTransaccion(entrada: CrearTransaccionEntrada) {
    if (!Number.isSafeInteger(entrada.valorPesos) || entrada.valorPesos <= 0 || entrada.moneda !== 'COP') {
      throw new ErrorDominio('VALOR_INVALIDO', 'El valor del pago no es válido.', 422);
    }
    // Endpoints Basic /login y Bearer /payment/session/create, esquema y SDK oficiales:
    // https://docs.epayco.com/docs/checkout-implementacion
    // La documentación usa el mismo host APIFY para ambos ambientes; test se fija en el SDK.
    const basica = Buffer.from(`${this.secreto('EPAYCO_LLAVE_PUBLICA')}:${this.secreto('EPAYCO_LLAVE_PRIVADA')}`).toString('base64');
    const autenticacion = await this.peticion('https://apify.epayco.co/login', { method: 'POST', headers: {
      Authorization: `Basic ${basica}`, 'Content-Type': 'application/json',
    } });
    const confirmacion = new URL(this.secreto('EPAYCO_URL_CONFIRMACION'));
    const sesion = await this.peticion('https://apify.epayco.co/payment/session/create', { method: 'POST', headers: {
      Authorization: `Bearer ${texto(autenticacion.token)}`, 'Content-Type': 'application/json',
    }, body: JSON.stringify({ checkout_version: '2', name: 'SIRA', description: entrada.descripcion,
      currency: entrada.moneda, amount: entrada.valorPesos, invoice: entrada.referencia,
      response: entrada.urlRetorno, confirmation: confirmacion.toString(), method: 'POST',
      billing: { email: entrada.correoPagador },
    }) });
    if (sesion.success !== true) throw new ErrorDominio('PASARELA_NO_DISPONIBLE', 'No pudimos abrir el pago ePayco.', 503);
    const sesionId = texto(objeto(sesion.data).sessionId);
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(sesionId)) throw new Error('Sesión ePayco inválida.');
    // El proveedor documenta configure({sessionId,type:'standard',test}), no una URL directa.
    // Puente local firmado por SIRA (esta firma NO es la firma del proveedor).
    const carga = Buffer.from(JSON.stringify({ sesionId, ambiente: this.ambiente(), exp: Date.now() + 20 * 60_000 })).toString('base64url');
    const token = `${carga}.${this.firmarPuente(carga)}`;
    const puente = new URL('/api/pagos/checkout/epayco', confirmacion);
    puente.searchParams.set('token', token);
    return { urlCheckout: puente.toString(), transaccionExternaId: null };
  }

  private firmarPuente(carga: string): string {
    return createHmac('sha256', this.secreto('EPAYCO_LLAVE_PRIVADA')).update(carga).digest('hex');
  }

  paginaCheckout(token: string): { html: string; csp: string } {
    const [carga, firma, extra] = token.split('.');
    if (!carga || !firma || extra || !iguales(this.firmarPuente(carga), firma)) {
      throw new ErrorDominio('CHECKOUT_INVALIDO', 'El enlace de pago no es válido.', 401);
    }
    let datos: Objeto;
    try { datos = objeto(JSON.parse(Buffer.from(carga, 'base64url').toString('utf8'))); }
    catch { throw new ErrorDominio('CHECKOUT_INVALIDO', 'El enlace de pago no es válido.', 401); }
    if (typeof datos.sesionId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(datos.sesionId) ||
        datos.ambiente !== this.ambiente() || typeof datos.exp !== 'number' || datos.exp < Date.now()) {
      throw new ErrorDominio('CHECKOUT_VENCIDO', 'El enlace de pago venció. Solicita a tesorería revisar el intento antes de abrir otro.', 409);
    }
    const nonce = randomBytes(18).toString('base64');
    const opciones = JSON.stringify({ sessionId: datos.sesionId, type: 'standard', test: this.ambiente() === 'test' });
    return {
      csp: `default-src 'none'; script-src 'nonce-${nonce}' https://*.epayco.co; connect-src https://*.epayco.co; frame-src https://*.epayco.co; style-src 'unsafe-inline' https://*.epayco.co; img-src https: data:; base-uri 'none'; frame-ancestors 'none'`,
      html: `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Pago seguro SIRA</title><body><h1>Pago seguro</h1><button id="abrir" type="button">Continuar a ePayco</button><script nonce="${nonce}" src="https://checkout.epayco.co/checkout-v2.js"></script><script nonce="${nonce}">document.getElementById('abrir').addEventListener('click',()=>{ePayco.checkout.configure(${opciones}).open();});</script></body></html>`,
    };
  }

  verificarFirmaWebhook(crudo: string, _cabeceras: Record<string, string>): boolean {
    try {
      const datos = this.cuerpo(crudo);
      // Fórmula oficial, preservando el texto exacto de x_amount:
      // https://docs.epayco.com/docs/checkout-respuesta-y-confirmacion
      const esperado = hash([this.secreto('EPAYCO_P_CUST_ID_CLIENTE'), this.secreto('EPAYCO_P_KEY'),
        texto(datos.x_ref_payco), texto(datos.x_transaction_id), texto(datos.x_amount), texto(datos.x_currency_code)].join('^'));
      return this.entornoValido(datos) && iguales(esperado, texto(datos.x_signature));
    } catch { return false; }
  }

  interpretarEvento(cuerpo: unknown): EventoInterpretado {
    const datos = this.cuerpo(cuerpo);
    if (!this.entornoValido(datos) || texto(datos.x_currency_code) !== 'COP') throw new Error('Ambiente o moneda ePayco inválidos.');
    // Los nombres de respuesta se documentan en la tabla de estados, sin inventar códigos numéricos.
    const estados: Record<string, EstadoTransaccion> = { Aceptada: 'APROBADA', Rechazada: 'RECHAZADA',
      Pendiente: 'PENDIENTE', Fallida: 'ERROR', Reversada: 'ANULADA', Iniciada: 'PENDIENTE',
      Expirada: 'ANULADA', Abandonada: 'ANULADA', Cancelada: 'ANULADA' };
    const respuesta = texto(datos.x_response);
    if (!Object.hasOwn(estados, respuesta)) throw new Error('Estado ePayco no reconocido.');
    const monto = this.pesos(datos.x_amount);
    const refPayco = texto(datos.x_ref_payco);
    const transaccion = texto(datos.x_transaction_id);
    // x_transaction_date no declara zona en la guía: no verificado; no se usa para decidir pagos.
    return { idEventoExterno: hash(`${refPayco}:${transaccion}:${respuesta}:${monto}`),
      referencia: texto(datos.x_id_invoice), estado: estados[respuesta]!, valorPesos: monto,
      transaccionExternaId: refPayco, ocurrioEn: new Date() };
  }

  async consultarTransaccion(refPayco: string): Promise<EventoInterpretado> {
    // Consulta oficial por ref_payco (el mismo host sirve test/prod):
    // https://docs.epayco.com/docs/checkout-respuesta-y-confirmacion
    const respuesta = await this.peticion(`https://secure.epayco.co/validation/v1/reference/${encodeURIComponent(refPayco)}`,
      { headers: { 'Content-Type': 'application/json' } });
    // Envoltorio success/data usado por el ejemplo oficial:
    // https://github.com/epayco/resources/blob/master/onePage/response/response.html
    if (respuesta.success !== true) throw new ErrorDominio('PASARELA_NO_DISPONIBLE', 'No pudimos consultar el pago ePayco.', 503);
    const datos = objeto(respuesta.data);
    // La firma documentada no cubre x_response ni x_id_invoice; el servicio contrasta con esta API.
    if (!this.verificarFirmaWebhook(JSON.stringify(datos), {})) throw new Error('Firma de consulta ePayco inválida.');
    const evento = this.interpretarEvento(datos);
    if (evento.transaccionExternaId !== refPayco) throw new Error('Referencia ePayco distinta a la consultada.');
    return evento;
  }
  async consultarPorReferencia(_referencia: string): Promise<EventoInterpretado | null> {
    // no verificado: no se encontró un endpoint oficial para buscar por x_id_invoice.
    // No se envía la factura local a /validation/v1/reference, que exige ref_payco.
    throw new ErrorDominio('INTEGRACION_NO_VERIFICADA', 'La consulta ePayco por factura no está verificada.', 503);
  }
  async consultarEstado(id: string): Promise<EstadoTransaccion> { return (await this.consultarTransaccion(id)).estado; }
  async reembolsar(_id: string, _valorPesos?: number): Promise<{ id: string; estado: string }> {
    // no verificado: no se encontró contrato de reembolso programático aplicable a Smart Checkout.
    throw new ErrorDominio('INTEGRACION_NO_VERIFICADA', 'El reembolso ePayco por API no está verificado; consulta con tesorería.', 501);
  }
  private async peticion(url: string, opciones: RequestInit = {}): Promise<Objeto> {
    const respuesta = await fetch(url, { ...opciones, signal: AbortSignal.timeout(8000), redirect: 'error' });
    if (!respuesta.ok) throw new ErrorDominio('PASARELA_NO_DISPONIBLE', 'ePayco no está disponible. Intenta más tarde.', 503);
    return objeto(await respuesta.json());
  }
}
