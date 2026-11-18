import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoldAdapter } from './bold.adapter.js';

const configuracion = (ambiente: string = 'prod') => new ConfigService({
  BOLD_AMBIENTE: ambiente, BOLD_LLAVE_IDENTIDAD: 'identidad-prueba', BOLD_LLAVE_SECRETA: 'secreto-prueba',
});
const entrada = {
  referencia: 'inv0334', valorPesos: 39400, moneda: 'COP' as const,
  correoPagador: 'ana@ejemplo.com', urlRetorno: 'https://sira.example/pagos/retorno', descripcion: 'Pago de reserva',
};

// Proyección del fixture Tarjeta Web publicado en https://developers.bold.co/webhook.
// Credenciales y firmas de los tests son sintéticas; no se atribuyen a un vector oficial.
function eventoOficial() {
  return {
    id: 'a9c1d0f5-3b7e-4d2a-9f6c-8e4b5d2f0a1b', type: 'SALE_APPROVED', subject: 'CNPCGSPS2WBA8',
    source: '/payments/links', spec_version: '1.0', time: 1761063334000000000,
    data: { payment_id: 'CNPCGSPS2WBA8', created_at: '2025-10-21T12:30:10-05:00',
      amount: { currency: 'COP', total: 59900 }, metadata: { reference: 'WEB-ORD-009876' } },
  };
}
function firmar(crudo: string, llave = 'secreto-prueba') {
  return createHmac('sha256', llave).update(Buffer.from(crudo, 'utf8').toString('base64')).digest('hex');
}
function respuesta(notifications: unknown[]) {
  const simulado = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ notifications }) });
  vi.stubGlobal('fetch', simulado);
  return simulado;
}

describe('BoldAdapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('prepara atributos oficiales del botón, conserva pesos y mantiene el secreto en el servidor', () => {
    // Algoritmo: https://developers.bold.co/pagos-en-linea/boton-de-pagos/integracion-manual/integracion-manual
    const atributos = new BoldAdapter(configuracion()).prepararBoton(entrada);
    expect(atributos).toMatchObject({ 'data-order-id': 'inv0334', 'data-amount': '39400',
      'data-currency': 'COP', 'data-api-key': 'identidad-prueba',
      'data-customer-data': '{"email":"ana@ejemplo.com"}',
      'data-integrity-signature': createHash('sha256').update('inv033439400COPsecreto-prueba').digest('hex') });
    expect(JSON.stringify(atributos)).not.toContain('secreto-prueba');
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rechaza valor inválido %s', (valorPesos) => {
    expect(() => new BoldAdapter(configuracion()).prepararBoton({ ...entrada, valorPesos }))
      .toThrow(expect.objectContaining({ codigo: 'VALOR_INVALIDO' }));
  });

  it('rechaza moneda, referencia, URL de retorno, ambiente y credenciales inválidas', () => {
    const adaptador = new BoldAdapter(configuracion());
    expect(() => adaptador.prepararBoton({ ...entrada, moneda: 'USD' as 'COP' })).toThrow();
    for (const referencia of ['', 'x'.repeat(61), 'inv?1', 'inv 1']) {
      expect(() => adaptador.prepararBoton({ ...entrada, referencia })).toThrow();
    }
    for (const urlRetorno of ['http://sira.example', 'javascript:alert(1)', 'https://u:p@sira.example', 'inválida']) {
      expect(() => adaptador.prepararBoton({ ...entrada, urlRetorno })).toThrow();
    }
    expect(() => new BoldAdapter(configuracion('otro')).prepararBoton(entrada)).toThrow();
    expect(() => new BoldAdapter(new ConfigService()).prepararBoton(entrada)).toThrow();
  });

  it('no inventa una URL de checkout mientras falte el puente frontend', async () => {
    const fetchSimulado = respuesta([]);
    await expect(new BoldAdapter(configuracion()).crearTransaccion(entrada))
      .rejects.toMatchObject({ codigo: 'INTEGRACION_NO_VERIFICADA', status: 501 });
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it('valida HMAC sobre base64 de los bytes UTF-8 exactos, con comparación constante', () => {
    const adaptador = new BoldAdapter(configuracion());
    const crudo = JSON.stringify({ ...eventoOficial(), comentario: 'reserva – ñ' });
    const firma = firmar(crudo);
    expect(adaptador.verificarFirmaWebhook(crudo, { 'x-bold-signature': firma })).toBe(true);
    expect(adaptador.verificarFirmaWebhook(crudo, { 'x-bold-signature': firma.toUpperCase() })).toBe(true);
    expect(adaptador.verificarFirmaWebhook(`${crudo} `, { 'x-bold-signature': firma })).toBe(false);
    const firmaSinBase64 = createHmac('sha256', 'secreto-prueba').update(crudo).digest('hex');
    expect(adaptador.verificarFirmaWebhook(crudo, { 'x-bold-signature': firmaSinBase64 })).toBe(false);
    expect(adaptador.verificarFirmaWebhook(crudo, { 'x-bold-signature': firmar(crudo, 'otro') })).toBe(false);
  });

  it.each(['', 'aa', 'g'.repeat(64), 'a'.repeat(63), 'a'.repeat(65)])('rechaza firma malformada %s sin lanzar', (firma) => {
    expect(new BoldAdapter(configuracion()).verificarFirmaWebhook('{}', { 'x-bold-signature': firma })).toBe(false);
  });

  it('usa secreto vacío solamente en test conforme al aviso oficial de Bold', () => {
    const crudo = JSON.stringify(eventoOficial());
    const firmaTest = { 'x-bold-signature': firmar(crudo, '') };
    expect(new BoldAdapter(configuracion('test')).verificarFirmaWebhook(crudo, firmaTest)).toBe(true);
    expect(new BoldAdapter(configuracion('prod')).verificarFirmaWebhook(crudo, firmaTest)).toBe(false);
    expect(new BoldAdapter(configuracion('test')).verificarFirmaWebhook(crudo, { 'x-bold-signature': firmar(crudo) })).toBe(false);
    expect(new BoldAdapter(configuracion('otro')).verificarFirmaWebhook(crudo, firmaTest)).toBe(false);
    expect(new BoldAdapter(new ConfigService({ BOLD_AMBIENTE: 'prod' })).verificarFirmaWebhook(crudo, firmaTest)).toBe(false);
  });

  it('interpreta el fixture oficial sin centavos y con el UUID estable del proveedor', () => {
    const adaptador = new BoldAdapter(configuracion());
    const evento = eventoOficial();
    expect(adaptador.interpretarEvento(evento)).toEqual({ idEventoExterno: evento.id,
      referencia: 'WEB-ORD-009876', transaccionExternaId: evento.subject, estado: 'APROBADA', valorPesos: 59900,
      ocurrioEn: new Date(1761063334000) });
    expect(adaptador.interpretarEvento(structuredClone(evento))).toEqual(adaptador.interpretarEvento(evento));
  });

  it.each([['SALE_REJECTED', 'RECHAZADA'], ['VOID_APPROVED', 'ANULADA']])('traduce %s a %s', (type, estado) => {
    expect(new BoldAdapter(configuracion()).interpretarEvento({ ...eventoOficial(), type }).estado).toBe(estado);
  });

  it('no confunde anulación rechazada con venta rechazada ni acepta campos inválidos', () => {
    const adaptador = new BoldAdapter(configuracion());
    for (const type of ['VOID_REJECTED', 'PENDING', '__proto__']) {
      expect(() => adaptador.interpretarEvento({ ...eventoOficial(), type })).toThrow();
    }
    for (const total of [0, -10, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      const evento = eventoOficial(); evento.data.amount.total = total;
      expect(() => adaptador.interpretarEvento(evento)).toThrow();
    }
    const evento = eventoOficial(); evento.data.amount.currency = 'USD';
    expect(() => adaptador.interpretarEvento(evento)).toThrow();
    expect(() => adaptador.interpretarEvento({ ...eventoOficial(), subject: 'otro' })).toThrow();
    for (const time of [0, NaN, Infinity, 1e30, '1761063334000000000']) {
      expect(() => adaptador.interpretarEvento({ ...eventoOficial(), time })).toThrow();
    }
    expect(() => adaptador.interpretarEvento({ ...eventoOficial(), id: '' })).toThrow();
    expect(() => adaptador.interpretarEvento({ ...eventoOficial(), data: {} })).toThrow();
  });

  it.each(['test', 'prod'])('consulta por ID con timeout y llaves del ambiente %s en el host oficial compartido', async (ambiente) => {
    const evento = eventoOficial(); const simulado = respuesta([evento]);
    expect(await new BoldAdapter(configuracion(ambiente)).consultarEstado(evento.subject)).toBe('APROBADA');
    expect(simulado).toHaveBeenCalledWith(`https://integrations.api.bold.co/payments/webhook/notifications/${evento.subject}`,
      expect.objectContaining({ headers: { Authorization: 'x-api-key identidad-prueba' }, redirect: 'error', signal: expect.any(AbortSignal) }));
  });

  it('busca por referencia exacta escapada y retorna null únicamente con lista vacía', async () => {
    const evento = eventoOficial(); evento.data.metadata.reference = 'OP/1?#';
    const simulado = respuesta([evento]);
    const adaptador = new BoldAdapter(configuracion());
    expect((await adaptador.consultarPorReferencia('OP/1?#'))?.referencia).toBe('OP/1?#');
    expect(simulado).toHaveBeenCalledWith('https://integrations.api.bold.co/payments/webhook/notifications/OP%2F1%3F%23?is_external_reference=true', expect.any(Object));
    respuesta([]);
    expect(await adaptador.consultarPorReferencia('OP/1?#')).toBeNull();
    await expect(adaptador.consultarTransaccion(evento.subject)).rejects.toMatchObject({ codigo: 'TRANSACCION_NO_ENCONTRADA' });
  });

  it('elige el evento más reciente por tiempo del proveedor, independiente del orden HTTP', async () => {
    const evento = eventoOficial();
    const anulado = { ...evento, id: 'anulacion-1', type: 'VOID_APPROVED', time: evento.time + 1e9 };
    respuesta([anulado, evento]);
    expect(await new BoldAdapter(configuracion()).consultarEstado(evento.subject)).toBe('ANULADA');
    respuesta([evento, anulado]);
    expect(await new BoldAdapter(configuracion()).consultarEstado(evento.subject)).toBe('ANULADA');
  });

  it('rechaza ID/referencia discordantes, múltiples pagos por referencia y eventos contradictorios', async () => {
    const evento = eventoOficial(); const adaptador = new BoldAdapter(configuracion());
    respuesta([evento]);
    await expect(adaptador.consultarTransaccion('otro')).rejects.toThrow();
    await expect(adaptador.consultarPorReferencia('otra')).rejects.toThrow();
    respuesta([evento, { ...evento, subject: 'otro', data: { ...evento.data, payment_id: 'otro' } }]);
    await expect(adaptador.consultarPorReferencia(evento.data.metadata.reference)).rejects.toMatchObject({ codigo: 'REFERENCIA_AMBIGUA' });
    respuesta([evento, { ...evento, id: 'otro-evento', type: 'VOID_APPROVED' }]);
    await expect(adaptador.consultarTransaccion(evento.subject)).rejects.toMatchObject({ codigo: 'EVENTOS_AMBIGUOS' });
  });

  it('falla cerrado con respuesta inválida o fallo HTTP/red sin filtrar secretos', async () => {
    const adaptador = new BoldAdapter(configuracion());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ notifications: {} }) }));
    await expect(adaptador.consultarTransaccion('id')).rejects.toMatchObject({ codigo: 'RESPUESTA_PASARELA_INVALIDA' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(adaptador.consultarPorReferencia('ref')).rejects.toMatchObject({ codigo: 'PASARELA_NO_DISPONIBLE' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('identidad-prueba secreto-prueba')));
    await expect(adaptador.consultarTransaccion('id')).rejects.toThrow('No pudimos consultar');
  });

  it('declara reembolso no soportado sin enviar solicitudes', async () => {
    const simulado = respuesta([]);
    await expect(new BoldAdapter(configuracion()).reembolsar('id', 39400))
      .rejects.toMatchObject({ codigo: 'REEMBOLSO_NO_SOPORTADO', status: 501 });
    expect(simulado).not.toHaveBeenCalled();
  });
});
