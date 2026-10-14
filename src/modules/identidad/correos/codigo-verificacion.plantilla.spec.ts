import { describe, expect, it } from 'vitest';
import {
  correoCodigoVerificacion,
  escaparHtml,
  type ContenidoCorreo,
  type DatosCorreoCodigo,
} from './codigo-verificacion.plantilla.js';

describe('correoCodigoVerificacion (Plantilla del correo)', () => {
  const datosValidos: DatosCorreoCodigo = {
    nombres: 'María Camila Benavides',
    codigo: '482913',
    minutosVigencia: 15,
  };

  it('el asunto empieza por el código de verificación para que se vea en la bandeja', () => {
    const { asunto }: ContenidoCorreo = correoCodigoVerificacion(datosValidos);

    expect(asunto.startsWith(datosValidos.codigo)).toBe(true);
    expect(asunto).toBe('482913 es tu código de verificación de SIRA');
  });

  it('html y texto contienen el código, los nombres y los minutos de vigencia', () => {
    const { html, texto }: ContenidoCorreo = correoCodigoVerificacion(datosValidos);

    expect(html).toContain(datosValidos.codigo);
    expect(html).toContain(datosValidos.nombres);
    expect(html).toContain(String(datosValidos.minutosVigencia));

    expect(texto).toContain(datosValidos.codigo);
    expect(texto).toContain(datosValidos.nombres);
    expect(texto).toContain(String(datosValidos.minutosVigencia));
  });

  it('nombres "<script>alert(1)</script>" quedan escapados en el html y legibles tal cual en el texto', () => {
    const datosXss: DatosCorreoCodigo = {
      nombres: '<script>alert(1)</script>',
      codigo: '987654',
      minutosVigencia: 10,
    };

    const { html, texto }: ContenidoCorreo = correoCodigoVerificacion(datosXss);

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(texto).toContain('<script>alert(1)</script>');
  });

  it('nombres \'Ana & "Luz"\' quedan escapados en el html y legibles tal cual en el texto', () => {
    const datosEspeciales: DatosCorreoCodigo = {
      nombres: 'Ana & "Luz"',
      codigo: '654321',
      minutosVigencia: 20,
    };

    const { html, texto }: ContenidoCorreo = correoCodigoVerificacion(datosEspeciales);

    expect(html).toContain('Ana &amp; &quot;Luz&quot;');
    expect(texto).toContain('Ana & "Luz"');
    expect(texto).not.toMatch(/<[^>]+>/);
  });

  it('el texto plano no contiene ninguna etiqueta HTML', () => {
    const { texto }: ContenidoCorreo = correoCodigoVerificacion(datosValidos);

    expect(texto).not.toMatch(/<[^>]+>/);
  });

  it('el html no contiene etiquetas <style>, enlaces <a> ni imágenes <img>', () => {
    const { html }: ContenidoCorreo = correoCodigoVerificacion(datosValidos);

    expect(html.toLowerCase()).not.toContain('<style');
    expect(html.toLowerCase()).not.toContain('<a ');
    expect(html.toLowerCase()).not.toContain('<img');
  });

  it('el html define estilos en línea con ancho máximo de 560px y bloque de código espaciado', () => {
    const { html }: ContenidoCorreo = correoCodigoVerificacion(datosValidos);

    expect(html).toContain('max-width: 560px');
    expect(html).toContain('letter-spacing: 8px');
    expect(html).toContain('style="');
  });

  it('el html y el texto incluyen el tono institucional y la advertencia de ignorar el mensaje', () => {
    const { html, texto }: ContenidoCorreo = correoCodigoVerificacion(datosValidos);

    expect(html).toContain('Institución Universitaria del Putumayo');
    expect(html).toContain('puedes ignorar este mensaje');

    expect(texto).toContain('Institución Universitaria del Putumayo');
    expect(texto).toContain('puedes ignorar este mensaje');
  });

  describe('validaciones de seguridad y fallo temprano', () => {
    it.each(['12345', '1234567', 'abc123', '12 456', '', '12345a'])(
      'código inválido "%s" lanza Error',
      (codigoInvalido) => {
        expect(() =>
          correoCodigoVerificacion({
            nombres: 'Pedro',
            codigo: codigoInvalido,
            minutosVigencia: 15,
          }),
        ).toThrow('El código de verificación debe ser una cadena de exactamente 6 dígitos.');
      },
    );

    it.each([0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY])(
      'minutosVigencia inválido (%s) lanza Error',
      (minutosInvalidos) => {
        expect(() =>
          correoCodigoVerificacion({
            nombres: 'Pedro',
            codigo: '123456',
            minutosVigencia: minutosInvalidos,
          }),
        ).toThrow('Los minutos de vigencia deben ser un número entero positivo.');
      },
    );

    it('acepta códigos válidos con ceros a la izquierda', () => {
      const resultado = correoCodigoVerificacion({
        nombres: 'Lucía',
        codigo: '000123',
        minutosVigencia: 15,
      });

      expect(resultado.asunto.startsWith('000123')).toBe(true);
      expect(resultado.html).toContain('000123');
      expect(resultado.texto).toContain('000123');
    });
  });
});

describe('escaparHtml', () => {
  it('escapa los caracteres &, <, >, " y \'', () => {
    const entrada = `& < > " '`;
    const esperado = '&amp; &lt; &gt; &quot; &#39;';

    expect(escaparHtml(entrada)).toBe(esperado);
  });

  it('no altera texto que no contenga caracteres especiales', () => {
    const entrada = 'Texto seguro sin caracteres conflictivos';

    expect(escaparHtml(entrada)).toBe(entrada);
  });
});
