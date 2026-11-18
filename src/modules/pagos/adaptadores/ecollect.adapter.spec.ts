import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EcollectAdapter } from './ecollect.adapter.js';

const configuracion = (ambiente = 'test') => new ConfigService({ ECOLLECT_AMBIENTE: ambiente,
  ECOLLECT_ENTITY_CODE: 'string', ECOLLECT_SRV_CODE: 'servicio-prueba', ECOLLECT_API_KEY: 'secreto-prueba',
  // URL sintética: no atribuida al proveedor, y nunca debe recibir una petición.
  ECOLLECT_URL_API: 'https://ecollect.example/no-verificado',
});
const entrada = { referencia: 'OP-2026-000001', valorPesos: 350000, moneda: 'COP' as const,
  correoPagador: 'ana@ejemplo.com', urlRetorno: 'https://sira.example/retorno', descripcion: 'Reserva' };

describe('EcollectAdapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('prepara exclusivamente el fragmento getTransactionInformation del manual oficial', () => {
    // Fixture: https://qa.e-collect.com/qa_manuales/Manuales/ecollectManualdeProducto.html
    expect(new EcollectAdapter(configuracion()).prepararConsulta('string')).toBe(
      '<getTransactionInformation><request><EntityCode>string</EntityCode><TicketId>string</TicketId></request></getTransactionInformation>',
    );
  });

  it('escapa contenido XML sin inventar namespace, SOAPAction ni campos de sesión', () => {
    const adaptador = new EcollectAdapter(new ConfigService({ ECOLLECT_ENTITY_CODE: 'A&B<1>' }));
    expect(adaptador.prepararConsulta('"\'</TicketId>')).toBe(
      '<getTransactionInformation><request><EntityCode>A&amp;B&lt;1&gt;</EntityCode><TicketId>&quot;&apos;&lt;/TicketId&gt;</TicketId></request></getTransactionInformation>',
    );
  });

  it('exige entidad y TicketId válidos sin aceptar controles XML ni sustitutos aislados', () => {
    expect(() => new EcollectAdapter(new ConfigService()).prepararConsulta('1'))
      .toThrow(expect.objectContaining({ codigo: 'PASARELA_SIN_CONFIGURAR' }));
    for (const id of ['', ' ', '\u0000', '\ud800', '\uffff']) {
      expect(() => new EcollectAdapter(configuracion()).prepararConsulta(id)).toThrow();
    }
    expect(() => new EcollectAdapter(configuracion('otro')).prepararConsulta('1')).toThrow();
  });

  it.each(['test', 'prod'])('no envía credenciales ni dinero a un endpoint no verificado en %s', async (ambiente) => {
    const simulado = vi.fn(); vi.stubGlobal('fetch', simulado);
    const adaptador = new EcollectAdapter(configuracion(ambiente));
    const noVerificado = { codigo: 'INTEGRACION_NO_VERIFICADA', status: 501 };
    await expect(adaptador.crearTransaccion(entrada)).rejects.toMatchObject(noVerificado);
    await expect(adaptador.consultarTransaccion('123')).rejects.toMatchObject(noVerificado);
    await expect(adaptador.consultarEstado('123')).rejects.toMatchObject(noVerificado);
    await expect(adaptador.consultarPorReferencia(entrada.referencia)).rejects.toMatchObject(noVerificado);
    await expect(adaptador.reembolsar('123', 350000)).rejects.toMatchObject(noVerificado);
    expect(simulado).not.toHaveBeenCalled();
  });

  it('jamás acepta una confirmación sin firma verificada aunque imite una respuesta aprobada', () => {
    const adaptador = new EcollectAdapter(configuracion());
    for (const crudo of ['', '{', '{}', '{"estado":"APROBADA"}']) {
      expect(adaptador.verificarFirmaWebhook(crudo, { authorization: 'secreto-prueba', 'x-signature': 'secreto-prueba' })).toBe(false);
    }
    expect(() => adaptador.interpretarEvento({ estado: 'APROBADA', valor: 350000 }))
      .toThrow(expect.objectContaining({ codigo: 'INTEGRACION_NO_VERIFICADA', status: 501 }));
  });

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rechaza valor inválido %s antes de integrar', async (valorPesos) => {
    await expect(new EcollectAdapter(configuracion()).crearTransaccion({ ...entrada, valorPesos }))
      .rejects.toMatchObject({ codigo: 'VALOR_INVALIDO', status: 422 });
  });

  it('no trata una OP como TicketId ni devuelve null para ocultar una consulta sin implementar', async () => {
    await expect(new EcollectAdapter(configuracion()).consultarPorReferencia(entrada.referencia)).rejects.toThrow('no verificado');
  });
});
