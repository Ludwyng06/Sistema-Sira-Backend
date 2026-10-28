/**
 * Plantilla del correo electrónico con el código de verificación para SIRA.
 * Función pura sin dependencias externas ni acceso a base de datos.
 */

export interface DatosCorreoCodigo {
  nombres: string;
  codigo: string;
  minutosVigencia: number;
}

export interface ContenidoCorreo {
  asunto: string;
  html: string;
  texto: string;
}

/**
 * Escapa los caracteres especiales & < > " ' en HTML para prevenir inyección de código.
 */
export function escaparHtml(texto: string): string {
  return String(texto)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Genera el contenido institucional del correo con el código de verificación para SIRA.
 */
export function correoCodigoVerificacion(datos: DatosCorreoCodigo): ContenidoCorreo {
  if (typeof datos?.codigo !== 'string' || !/^\d{6}$/.test(datos.codigo)) {
    throw new Error('El código de verificación debe ser una cadena de exactamente 6 dígitos.');
  }

  if (
    typeof datos?.minutosVigencia !== 'number' ||
    !Number.isInteger(datos.minutosVigencia) ||
    datos.minutosVigencia <= 0
  ) {
    throw new Error('Los minutos de vigencia deben ser un número entero positivo.');
  }

  const nombres = datos.nombres ?? '';
  const nombresEscapados = escaparHtml(nombres);
  const asunto = `${datos.codigo} es tu código de verificación de SIRA`;

  const texto = [
    `Hola, ${nombres}:`,
    '',
    `Tu código de verificación de SIRA es: ${datos.codigo}`,
    '',
    `Este código es válido durante ${datos.minutosVigencia} minutos y solo sirve para`,
    'verificar tu cuenta de correo electrónico en SIRA (Sistema de Inventario y Reserva',
    'de Activos de la Institución Universitaria del Putumayo).',
    '',
    'Si no te registraste en SIRA o no solicitaste este código, puedes ignorar este mensaje.',
    '',
  ].join('\n');

  const html = [
    '<!DOCTYPE html>',
    '<html lang="es">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `  <title>${datos.codigo} es tu código de verificación de SIRA</title>`,
    '</head>',
    '<body style="margin: 0; padding: 24px 12px; background-color: #f8fafc; ' +
      'font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; color: #0f172a;">',
    '  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" ' +
      'style="max-width: 560px; margin: 0 auto; background-color: #ffffff; ' +
      'border: 1px solid #cbd5e1; border-radius: 8px;">',
    '    <tr>',
    '      <td style="padding: 24px 24px 16px 24px; border-bottom: 2px solid #0f172a;">',
    '        <p style="margin: 0; font-size: 18px; font-weight: 700; color: #0f172a; line-height: 1.3;">',
    '          SIRA · Institución Universitaria del Putumayo',
    '        </p>',
    '        <p style="margin: 4px 0 0 0; font-size: 13px; color: #475569;">',
    '          Sistema de Inventario y Reserva de Activos',
    '        </p>',
    '      </td>',
    '    </tr>',
    '    <tr>',
    '      <td style="padding: 24px;">',
    '        <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5; color: #0f172a;">',
    `          Hola, <strong>${nombresEscapados}</strong>:`,
    '        </p>',
    '        <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5; color: #334155;">',
    '          Tu código de verificación para SIRA es:',
    '        </p>',
    '        <div style="margin: 24px 0; padding: 20px; background-color: #f1f5f9; ' +
      'border: 1px solid #cbd5e1; border-radius: 8px; text-align: center;">',
    '          <span style="font-family: Consolas, \'Liberation Mono\', Menlo, Courier, monospace; ' +
      'font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #0f172a;">',
    `            ${datos.codigo}`,
    '          </span>',
    '        </div>',
    '        <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.5; color: #334155;">',
    `          Este código es válido durante <strong>${datos.minutosVigencia} minutos</strong> ` +
      'y solo sirve para verificar tu cuenta de correo electrónico en SIRA.',
    '        </p>',
    '        <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #64748b;">',
    '          Si no te registraste en SIRA o no solicitaste este código, puedes ignorar este mensaje.',
    '        </p>',
    '      </td>',
    '    </tr>',
    '  </table>',
    '</body>',
    '</html>',
  ].join('\n');

  return { asunto, html, texto };
}
