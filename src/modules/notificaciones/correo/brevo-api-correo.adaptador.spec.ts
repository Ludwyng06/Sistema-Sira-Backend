import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import { BrevoApiCorreoAdaptador } from './brevo-api-correo.adaptador.js';

const apiKey = 'clave-brevo-solo-de-prueba';
const mensaje = {
  para: 'persona@ejemplo.com', asunto: 'Verifica tu correo',
  html: '<p>Código 123456</p>', texto: 'Código 123456',
};
const fetchSimulado = vi.fn<typeof fetch>();

function crearAdaptador(remitente = 'SIRA <no-reply@sira.test>') {
  return new BrevoApiCorreoAdaptador(new ConfigService({
    BREVO_API_KEY: apiKey, CORREO_REMITENTE: remitente,
  }));
}

describe('BrevoApiCorreoAdaptador', () => {
  beforeEach(() => {
    fetchSimulado.mockReset();
    vi.stubGlobal('fetch', fetchSimulado);
    fetchSimulado.mockResolvedValue(new Response(null, { status: 201 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('envía por HTTPS todos los campos con autenticación y timeout de diez segundos', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    await expect(crearAdaptador().enviar(mensaje)).resolves.toBeUndefined();

    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(fetchSimulado).toHaveBeenCalledExactlyOnceWith('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'SIRA', email: 'no-reply@sira.test' },
        to: [{ email: mensaje.para }], subject: mensaje.asunto,
        htmlContent: mensaje.html, textContent: mensaje.texto,
      }),
      signal: timeout.mock.results[0].value,
    });
  });

  it.each([
    ['SIRA Uniputumayo <correo@sira.test>', 'SIRA Uniputumayo', 'correo@sira.test'],
    ['  SIRA   < correo@sira.test >  ', 'SIRA', 'correo@sira.test'],
    [' correo@sira.test ', 'correo@sira.test', 'correo@sira.test'],
  ])('interpreta el remitente %s', async (remitente, name, email) => {
    await crearAdaptador(remitente).enviar(mensaje);
    const cuerpo = JSON.parse(fetchSimulado.mock.calls[0][1]?.body as string);
    expect(cuerpo.sender).toEqual({ name, email });
  });

  it.each([400, 401, 429, 500, 503])('convierte HTTP %i en el mismo error de dominio seguro', async (status) => {
    const registro = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    fetchSimulado.mockResolvedValue(new Response(`Rechazada ${apiKey} ${apiKey}`, { status }));

    const error = await crearAdaptador().enviar(mensaje).catch((capturado: unknown) => capturado);

    expect(error).toBeInstanceOf(ErrorDominio);
    expect(error).toMatchObject({
      codigo: 'CORREO_NO_ENVIADO', status: 503,
      message: 'No pudimos enviar el correo. Intenta de nuevo en unos minutos.',
    });
    expect(registro).toHaveBeenCalledWith(
      `Error técnico al enviar correo: Error: Brevo HTTP ${status}: Rechazada [REDACTADO] [REDACTADO]`,
    );
    expect(JSON.stringify(registro.mock.calls)).not.toContain(apiKey);
    expect(String(error)).not.toContain(apiKey);
  });

  it.each([
    new Error(`Error de red ${apiKey}`),
    new DOMException(`Timeout ${apiKey}`, 'TimeoutError'),
    `Rechazo no Error ${apiKey}`,
  ])('registra fallos de red y timeout sin revelar la clave: %#', async (fallo) => {
    const registro = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    fetchSimulado.mockRejectedValue(fallo);

    await expect(crearAdaptador().enviar(mensaje)).rejects.toMatchObject({
      codigo: 'CORREO_NO_ENVIADO', status: 503,
      message: 'No pudimos enviar el correo. Intenta de nuevo en unos minutos.',
    });

    expect(registro).toHaveBeenCalledOnce();
    expect(JSON.stringify(registro.mock.calls)).toContain('[REDACTADO]');
    expect(JSON.stringify(registro.mock.calls)).not.toContain(apiKey);
  });
});
