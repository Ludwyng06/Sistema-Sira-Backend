/**
 * Plantilla del correo con el enlace para restablecer la contraseña en SIRA.
 * Función pura sin dependencias externas ni acceso a base de datos.
 */
import { escaparHtml, type ContenidoCorreo } from './codigo-verificacion.plantilla.js';

export interface DatosCorreoRecuperacion {
  nombres: string;
  enlace: string;
  minutosVigencia: number;
}

function validarEnlace(enlace: unknown): string {
  if (typeof enlace !== 'string') throw new Error('El enlace de recuperación debe ser un texto.');
  let url: URL;
  try {
    url = new URL(enlace);
  } catch {
    throw new Error('El enlace de recuperación no es una URL válida.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('El enlace de recuperación debe usar http o https.');
  }
  return enlace;
}

export function correoRecuperacion(datos: DatosCorreoRecuperacion): ContenidoCorreo {
  const enlace = validarEnlace(datos?.enlace);
  if (
    typeof datos.minutosVigencia !== 'number' ||
    !Number.isInteger(datos.minutosVigencia) ||
    datos.minutosVigencia <= 0
  ) {
    throw new Error('Los minutos de vigencia deben ser un número entero positivo.');
  }

  const nombres = datos.nombres ?? '';
  const nombresEscapados = escaparHtml(nombres);
  const enlaceEscapado = escaparHtml(enlace);
  const asunto = 'Restablece tu contraseña de SIRA';

  const texto = [
    `Hola, ${nombres}:`,
    '',
    'Recibimos una solicitud para restablecer la contraseña de tu cuenta de SIRA.',
    'Abre este enlace para elegir una contraseña nueva:',
    '',
    enlace,
    '',
    `El enlace es válido durante ${datos.minutosVigencia} minutos y solo se puede usar una vez.`,
    '',
    'Si no lo solicitaste, ignora este mensaje: tu contraseña seguirá igual.',
    '',
  ].join('\n');

  const html = [
    '<!DOCTYPE html>',
    '<html lang="es">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '  <title>Restablece tu contraseña de SIRA</title>',
    '</head>',
    '<body style="margin: 0; padding: 24px 12px; background-color: #f8fafc; ' +
      "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a;\">",
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
    '          Recibimos una solicitud para restablecer la contraseña de tu cuenta de SIRA.',
    '        </p>',
    '        <p style="margin: 24px 0; text-align: center;">',
    `          <a href="${enlaceEscapado}" style="display: inline-block; padding: 12px 24px; ` +
      'background-color: #0f172a; color: #ffffff; font-size: 15px; font-weight: 700; ' +
      'text-decoration: none; border-radius: 6px;">Restablecer contraseña</a>',
    '        </p>',
    '        <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.5; color: #334155;">',
    `          El enlace es válido durante <strong>${datos.minutosVigencia} minutos</strong> ` +
      'y solo se puede usar una vez.',
    '        </p>',
    '        <p style="margin: 0 0 12px 0; font-size: 13px; line-height: 1.5; color: #64748b;">',
    '          Si el botón no funciona, copia y pega este enlace en tu navegador:<br />',
    `          <span style="word-break: break-all;">${enlaceEscapado}</span>`,
    '        </p>',
    '        <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #64748b;">',
    '          Si no lo solicitaste, ignora este mensaje: tu contraseña seguirá igual.',
    '        </p>',
    '      </td>',
    '    </tr>',
    '  </table>',
    '</body>',
    '</html>',
  ].join('\n');

  return { asunto, html, texto };
}
