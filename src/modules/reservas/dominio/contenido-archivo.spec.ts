import { describe, expect, it } from 'vitest';
import { detectarTipoMime, nombreSeguro } from './contenido-archivo.js';

describe('detectarTipoMime', () => {
  it('reconoce PDF, PNG y JPEG por sus primeros bytes', () => {
    expect(detectarTipoMime(Buffer.from('%PDF-1.7\n...'))).toBe('application/pdf');
    expect(detectarTipoMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))).toBe('image/png');
    expect(detectarTipoMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('image/jpeg');
  });

  it('rechaza ejecutables, HTML y archivos vacíos aunque el nombre diga otra cosa', () => {
    expect(detectarTipoMime(Buffer.from('MZ\x90\x00'))).toBeNull();
    expect(detectarTipoMime(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
    expect(detectarTipoMime(Buffer.alloc(0))).toBeNull();
  });
});

describe('nombreSeguro', () => {
  it('quita rutas y caracteres de control', () => {
    expect(nombreSeguro('C:\\Users\\ana\\poliza.pdf')).toBe('poliza.pdf');
    expect(nombreSeguro('../../etc/pass\u0000wd.pdf')).toBe('passwd.pdf');
  });

  it('usa un nombre por defecto si queda vacío y acota el largo', () => {
    expect(nombreSeguro('   ')).toBe('documento');
    expect(nombreSeguro(`${'a'.repeat(300)}.pdf`)).toHaveLength(120);
    expect(nombreSeguro(`${'a'.repeat(300)}.pdf`).endsWith('.pdf')).toBe(true);
  });
});
