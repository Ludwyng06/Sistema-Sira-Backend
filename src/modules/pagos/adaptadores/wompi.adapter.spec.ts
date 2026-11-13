import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WompiAdapter } from './wompi.adapter.js';

const configuracion = (ambiente: 'test' | 'prod' = 'test') => new ConfigService({
  WOMPI_AMBIENTE: ambiente,
  WOMPI_URL_API: ambiente === 'test' ? 'https://sandbox.wompi.co/v1' : 'https://production.wompi.co/v1',
  WOMPI_LLAVE_PUBLICA: 'pub_test_ejemplo', WOMPI_LLAVE_PRIVADA: 'prv_test_ejemplo',
  WOMPI_SECRETO_INTEGRIDAD: 'prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6',
  WOMPI_SECRETO_EVENTOS: 'secreto_de_prueba',
});

function eventoFirmado() {
  const evento = {
    event: 'transaction.updated', environment: 'test', timestamp: 1794500000,
    data: { transaction: { id: 'wompi-1', reference: 'OP-2026-000001', amount_in_cents: 35000000,
      currency: 'COP', status: 'APPROVED' } },
    signature: { properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'], checksum: '' },
  };
  evento.signature.checksum = createHash('sha256')
    .update('wompi-1APPROVED350000001794500000secreto_de_prueba').digest('hex');
  return evento;
}

describe('WompiAdapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('genera la firma de integridad del vector publicado por Wompi y convierte pesos solo aquí', async () => {
    const respuesta = await new WompiAdapter(configuracion()).crearTransaccion({
      referencia: 'sk8-438k4-xmxm392-sn2m', valorPesos: 24900, moneda: 'COP',
      correoPagador: 'ana@ejemplo.com', urlRetorno: 'http://localhost:3000/pagos/retorno', descripcion: 'Prueba',
    });
    const url = new URL(respuesta.urlCheckout);
    expect(url.origin + url.pathname).toBe('https://checkout.wompi.co/p/');
    expect(url.searchParams.get('amount-in-cents')).toBe('2490000');
    expect(url.searchParams.get('signature:integrity')).toBe('37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5');
    expect(respuesta.transaccionExternaId).toBeNull();
    expect(respuesta.urlCheckout).not.toContain('prod_integrity_');
  });

  it('acepta firma válida por cuerpo o cabecera, también en mayúsculas', () => {
    const adaptador = new WompiAdapter(configuracion());
    const evento = eventoFirmado();
    expect(adaptador.verificarFirmaWebhook(JSON.stringify(evento), {})).toBe(true);
    expect(adaptador.verificarFirmaWebhook(JSON.stringify(evento), {
      'x-event-checksum': evento.signature.checksum.toUpperCase(),
    })).toBe(true);
  });

  it.each(['id', 'status', 'amount_in_cents'] as const)('rechaza la propiedad firmada manipulada: %s', (campo) => {
    const evento = eventoFirmado();
    if (campo === 'amount_in_cents') evento.data.transaction[campo] += 100;
    else evento.data.transaction[campo] = 'manipulado';
    expect(new WompiAdapter(configuracion()).verificarFirmaWebhook(JSON.stringify(evento), {})).toBe(false);
  });

  it('rechaza checksum malformado, secreto incorrecto, JSON inválido y properties incompletas', () => {
    const adaptador = new WompiAdapter(configuracion());
    const evento = eventoFirmado();
    expect(adaptador.verificarFirmaWebhook(JSON.stringify(evento), { 'x-event-checksum': 'aa' })).toBe(false);
    expect(new WompiAdapter(new ConfigService({ WOMPI_SECRETO_EVENTOS: 'otro' }))
      .verificarFirmaWebhook(JSON.stringify(evento), {})).toBe(false);
    expect(adaptador.verificarFirmaWebhook('{', {})).toBe(false);
    evento.signature.properties = [];
    expect(adaptador.verificarFirmaWebhook(JSON.stringify(evento), {})).toBe(false);
  });

  it('usa las properties del evento en el orden recibido, admitiendo propiedades adicionales', () => {
    const evento = eventoFirmado();
    evento.signature.properties = ['transaction.amount_in_cents', 'transaction.id', 'transaction.currency', 'transaction.status'];
    evento.signature.checksum = createHash('sha256')
      .update('35000000wompi-1COPAPPROVED1794500000secreto_de_prueba').digest('hex');
    expect(new WompiAdapter(configuracion()).verificarFirmaWebhook(JSON.stringify(evento), {})).toBe(true);
  });

  it('interpreta pesos enteros e identidad estable independiente de campos no firmados', () => {
    const adaptador = new WompiAdapter(configuracion());
    const evento = eventoFirmado();
    const interpretado = adaptador.interpretarEvento(evento);
    expect(interpretado).toMatchObject({ valorPesos: 350000, estado: 'APROBADA', transaccionExternaId: 'wompi-1' });
    evento.data.transaction.reference = 'referencia-manipulada';
    expect(adaptador.interpretarEvento(evento).idEventoExterno).toBe(interpretado.idEventoExterno);
    evento.data.transaction.amount_in_cents = 101;
    expect(() => adaptador.interpretarEvento(evento)).toThrow();
  });

  it('consulta por GET al sandbox con timeout y traduce el estado', async () => {
    const fetchSimulado = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: eventoFirmado().data.transaction }) });
    vi.stubGlobal('fetch', fetchSimulado);
    expect(await new WompiAdapter(configuracion()).consultarEstado('wompi-1')).toBe('APROBADA');
    expect(fetchSimulado).toHaveBeenCalledWith('https://sandbox.wompi.co/v1/transactions/wompi-1',
      expect.objectContaining({ headers: { Authorization: 'Bearer prv_test_ejemplo' }, redirect: 'error' }));
  });

  it('busca sin ID por referencia exacta y usa llave privada', async () => {
    const transaccion = eventoFirmado().data.transaction;
    const fetchSimulado = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [
      { ...transaccion, reference: `${transaccion.reference}-otra` }, transaccion,
    ] }) });
    vi.stubGlobal('fetch', fetchSimulado);
    const resultado = await new WompiAdapter(configuracion()).consultarPorReferencia(transaccion.reference);
    expect(resultado).toMatchObject({ referencia: transaccion.reference, estado: 'APROBADA', valorPesos: 350000 });
    expect(fetchSimulado).toHaveBeenCalledWith(`https://sandbox.wompi.co/v1/transactions?reference=${transaccion.reference}`,
      expect.objectContaining({ headers: { Authorization: 'Bearer prv_test_ejemplo' } }));
  });

  it('una búsqueda vacía o sin referencia exactamente igual no inventa transacción', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [eventoFirmado().data.transaction] }) }));
    await expect(new WompiAdapter(configuracion()).consultarPorReferencia('inexistente')).resolves.toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }));
    await expect(new WompiAdapter(configuracion()).consultarPorReferencia('inexistente')).resolves.toBeNull();
  });

  it('no elige arbitrariamente entre varias transacciones de la misma referencia', async () => {
    const transaccion = eventoFirmado().data.transaction;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [transaccion, { ...transaccion, id: 'otro-id' }] }) }));
    await expect(new WompiAdapter(configuracion()).consultarPorReferencia(transaccion.reference)).rejects.toThrow('ambigua');
  });

  it('prod selecciona production y exige environment prod para eventos', async () => {
    const adaptador = new WompiAdapter(configuracion('prod'));
    const evento = eventoFirmado();
    expect(adaptador.verificarFirmaWebhook(JSON.stringify(evento), {})).toBe(false);
    evento.environment = 'prod';
    expect(adaptador.verificarFirmaWebhook(JSON.stringify(evento), {})).toBe(true);
    expect(adaptador.interpretarEvento(evento).estado).toBe('APROBADA');
    const fetchSimulado = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: evento.data.transaction }) });
    vi.stubGlobal('fetch', fetchSimulado);
    await adaptador.consultarTransaccion('wompi-1');
    expect(fetchSimulado).toHaveBeenCalledWith('https://production.wompi.co/v1/transactions/wompi-1', expect.any(Object));
  });

  it('no acepta eventos de producción ni estados o moneda desconocidos', () => {
    const adaptador = new WompiAdapter(configuracion());
    const evento = eventoFirmado();
    evento.environment = 'prod';
    expect(adaptador.verificarFirmaWebhook(JSON.stringify(evento), {})).toBe(false);
    evento.environment = 'test';
    evento.data.transaction.currency = 'USD';
    expect(() => adaptador.interpretarEvento(evento)).toThrow();
  });

  it('declara el reembolso no soportado sin enviar solicitudes', async () => {
    const fetchSimulado = vi.fn();
    vi.stubGlobal('fetch', fetchSimulado);
    await expect(new WompiAdapter(configuracion()).reembolsar('wompi-1'))
      .rejects.toMatchObject({ codigo: 'REEMBOLSO_NO_SOPORTADO', status: 501 });
    expect(fetchSimulado).not.toHaveBeenCalled();
  });
});
