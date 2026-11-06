export type TipoMimePermitido = 'application/pdf' | 'image/png' | 'image/jpeg';

export const EXTENSION_POR_TIPO: Record<TipoMimePermitido, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

const PDF = Buffer.from('%PDF-');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);

/** Determina el tipo por los primeros bytes (03-backend §8): nunca confía en el nombre ni en el Content-Type. */
export function detectarTipoMime(contenido: Buffer): TipoMimePermitido | null {
  if (contenido.subarray(0, PDF.length).equals(PDF)) return 'application/pdf';
  if (contenido.subarray(0, PNG.length).equals(PNG)) return 'image/png';
  if (contenido.subarray(0, JPEG.length).equals(JPEG)) return 'image/jpeg';
  return null;
}

/** Nombre seguro para mostrar y descargar: sin rutas, sin caracteres de control, con largo acotado. */
export function nombreSeguro(original: string, maximo = 120): string {
  const base = original.split(/[\\/]/).pop() ?? '';
  const sinControl = [...base].filter((c) => {
    const codigo = c.codePointAt(0) ?? 0;
    return codigo > 0x1f && codigo !== 0x7f;
  });
  const limpio = sinControl.join('').replace(/\s+/g, ' ').trim();
  const nombre = limpio.length > 0 ? limpio : 'documento';
  return nombre.length > maximo ? nombre.slice(nombre.length - maximo) : nombre;
}
