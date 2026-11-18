import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EpaycoAdapter } from './epayco.adapter.js';

function adaptador(ambiente: 'test' | 'prod' = 'test') {
  return new EpaycoAdapter(new ConfigService({ EPAYCO_AMBIENTE: ambiente,
    EPAYCO_P_CUST_ID_CLIENTE: 'cliente-ejemplo', EPAYCO_P_KEY: 'firma-ejemplo',
    EPAYCO_LLAVE_PUBLICA: 'publica-ejemplo', EPAYCO_LLAVE_PRIVADA: 'privada-ejemplo',
    EPAYCO_URL_CONFIRMACION: 'https://sira.example/api/pagos/webhooks/epayco',
  }));
}

/** Nombres de campos y estados de la documentación, ref_payco del ejemplo público,
 * invoice/valor del ejemplo de confirmación oficial; credenciales y transaction_id sintéticos.
 * https://docs.epayco.com/docs/checkout-respuesta-y-confirmacion
 * https://github.com/epayco/resources/blob/master/onePage/confirmation/confirmation.php */
function confirmacion() {
  const datos = { x_ref_payco: '68fb83729d094878e015be00', x_transaction_id: 'transaccion-ejemplo',
    x_id_invoice: '2531', x_amount: '10000.00', x_currency_code: 'COP', x_response: 'Aceptada',
    x_test_request: 'true', x_signature: '' };
  datos.x_signature = createHash('sha256')
    .update('cliente-ejemplo^firma-ejemplo^68fb83729d094878e015be00^transaccion-ejemplo^10000.00^COP').digest('hex');
  return datos;
}

describe('EpaycoAdapter', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('verifica la firma oficial de JSON y formulario sin reformatear x_amount', () => {
    const datos = confirmacion(); const epayco = adaptador();
    expect(epayco.verificarFirmaWebhook(JSON.stringify(datos), {})).toBe(true);
    expect(epayco.verificarFirmaWebhook(new URLSearchParams(datos).toString(), {})).toBe(true);
    expect(epayco.interpretarEvento(datos)).toMatchObject({ referencia: '2531', valorPesos: 10000,
      estado: 'APROBADA', transaccionExternaId: datos.x_ref_payco });
    expect(epayco.interpretarEvento(datos).idEventoExterno).toBe(epayco.interpretarEvento(JSON.stringify(datos)).idEventoExterno);
  });

  it('rechaza firma truncada o monto y moneda manipulados', () => {
    const epayco = adaptador(); const datos = confirmacion();
    expect(epayco.verificarFirmaWebhook(JSON.stringify({ ...datos, x_signature: 'ab' }), {})).toBe(false);
    expect(epayco.verificarFirmaWebhook(JSON.stringify({ ...datos, x_amount: '10001.00' }), {})).toBe(false);
    expect(epayco.verificarFirmaWebhook(JSON.stringify({ ...datos, x_currency_code: 'USD' }), {})).toBe(false);
    expect(epayco.verificarFirmaWebhook(JSON.stringify({ ...datos, x_amount: '10000' }), {})).toBe(false);
  });

  it('no mezcla ambientes ni acepta campos repetidos en formularios', () => {
    const datos = confirmacion();
    expect(adaptador('prod').verificarFirmaWebhook(JSON.stringify(datos), {})).toBe(false);
    expect(adaptador('prod').verificarFirmaWebhook(JSON.stringify({ ...datos, x_test_request: 'false' }), {})).toBe(true);
    expect(adaptador().verificarFirmaWebhook(`${new URLSearchParams(datos)}&x_amount=1`, {})).toBe(false);
  });

  it('rechaza fracciones, moneda distinta y estados desconocidos al interpretar', () => {
    const epayco = adaptador(); const datos = confirmacion();
    expect(() => epayco.interpretarEvento({ ...datos, x_amount: '10000.01' })).toThrow();
    expect(() => epayco.interpretarEvento({ ...datos, x_currency_code: 'USD' })).toThrow();
    expect(() => epayco.interpretarEvento({ ...datos, x_response: 'desconocida' })).toThrow();
  });

  it('crea sesión APIFY según el ejemplo oficial y devuelve un puente con SDK standard', async () => {
    // sessionId del ejemplo oficial: https://docs.epayco.com/docs/checkout-implementacion
    const fetchSimulado = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'token-ejemplo' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { sessionId: '68eefce71d65f1d39c0f6dad' } }) });
    vi.stubGlobal('fetch', fetchSimulado);
    const epayco = adaptador();
    const checkout = await epayco.crearTransaccion({ referencia: '2531', valorPesos: 200000, moneda: 'COP',
      correoPagador: 'ana@ejemplo.com', urlRetorno: 'https://sira.example/pagos/retorno?orden=uuid', descripcion: 'Reserva SIRA' });
    expect(fetchSimulado.mock.calls[0]![0]).toBe('https://apify.epayco.co/login');
    expect(fetchSimulado.mock.calls[1]![0]).toBe('https://apify.epayco.co/payment/session/create');
    const opciones = fetchSimulado.mock.calls[1]![1] as RequestInit;
    expect(JSON.parse(opciones.body as string)).toMatchObject({ checkout_version: '2', amount: 200000, currency: 'COP',
      invoice: '2531', confirmation: 'https://sira.example/api/pagos/webhooks/epayco' });
    expect(checkout.transaccionExternaId).toBeNull();
    const url = new URL(checkout.urlCheckout);
    expect(url.pathname).toBe('/api/pagos/checkout/epayco');
    const pagina = epayco.paginaCheckout(url.searchParams.get('token')!);
    expect(pagina.html).toContain('https://checkout.epayco.co/checkout-v2.js');
    expect(pagina.html).toContain('"type":"standard","test":true');
    expect(pagina.html).not.toContain('privada-ejemplo');
    expect(pagina.csp).toContain("script-src 'nonce-");
    expect(() => epayco.paginaCheckout(`${url.searchParams.get('token')}0`)).toThrow();
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 21 * 60_000);
    expect(() => epayco.paginaCheckout(url.searchParams.get('token')!)).toThrow('venció');
  });

  it('consulta por ref_payco, verifica la firma de los datos consultados y traduce estado', async () => {
    const datos = confirmacion();
    const fetchSimulado = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: datos }) });
    vi.stubGlobal('fetch', fetchSimulado);
    await expect(adaptador().consultarEstado(datos.x_ref_payco)).resolves.toBe('APROBADA');
    expect(fetchSimulado).toHaveBeenCalledWith(`https://secure.epayco.co/validation/v1/reference/${datos.x_ref_payco}`, expect.any(Object));
    datos.x_signature = 'a'.repeat(64);
    await expect(adaptador().consultarTransaccion(datos.x_ref_payco)).rejects.toThrow('Firma');
  });

  it('no inventa endpoints de búsqueda por factura o reembolso', async () => {
    const fetchSimulado = vi.fn(); vi.stubGlobal('fetch', fetchSimulado);
    await expect(adaptador().consultarPorReferencia('2531')).rejects.toMatchObject({ codigo: 'INTEGRACION_NO_VERIFICADA', status: 503 });
    await expect(adaptador().reembolsar('ref')).rejects.toMatchObject({ codigo: 'INTEGRACION_NO_VERIFICADA', status: 501 });
    expect(fetchSimulado).not.toHaveBeenCalled();
  });
});
