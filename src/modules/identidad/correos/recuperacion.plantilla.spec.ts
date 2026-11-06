import { describe, expect, it } from 'vitest';
import { correoRecuperacion } from './recuperacion.plantilla.js';

const ENLACE = 'https://sira.uniputumayo.edu.co/restablecer?token=abc.def_ghi';

describe('correoRecuperacion', () => {
  it('incluye asunto, enlace, vigencia y aviso de un solo uso', () => {
    const { asunto, html, texto } = correoRecuperacion({ nombres: 'Ana', enlace: ENLACE, minutosVigencia: 30 });
    expect(asunto).toBe('Restablece tu contraseña de SIRA');
    expect(html).toContain(`href="${ENLACE}"`);
    expect(html).toContain('30 minutos');
    expect(texto).toContain(ENLACE);
    expect(texto).toContain('30 minutos');
    expect(texto).toContain('una vez');
    expect(texto).toContain('ignora este mensaje');
    expect(texto).toContain('tu contraseña seguirá igual');
  });

  it('escapa nombres y enlace en el HTML, atributo href incluido', () => {
    const enlace = 'https://sira.test/restablecer?token=a"b&x=<y>';
    const { html } = correoRecuperacion({ nombres: '<script>alert(1)</script>', enlace, minutosVigencia: 30 });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('href="https://sira.test/restablecer?token=a&quot;b&amp;x=&lt;y&gt;"');
    expect(html).not.toContain('a"b');
  });

  it('rechaza esquemas distintos de http y https', () => {
    for (const enlace of ['javascript:alert(1)', 'data:text/html,hola', 'ftp://sira.test/x', 'no es url']) {
      expect(() => correoRecuperacion({ nombres: 'Ana', enlace, minutosVigencia: 30 })).toThrow(Error);
    }
  });

  it('rechaza minutos de vigencia inválidos', () => {
    for (const minutosVigencia of [0, -1, 1.5, Number.NaN]) {
      expect(() => correoRecuperacion({ nombres: 'Ana', enlace: ENLACE, minutosVigencia })).toThrow(Error);
    }
  });

  it('el texto plano no contiene etiquetas HTML', () => {
    const { texto } = correoRecuperacion({ nombres: 'Ana', enlace: ENLACE, minutosVigencia: 30 });
    expect(texto).not.toMatch(/<[a-z/][^>]*>/i);
  });
});
