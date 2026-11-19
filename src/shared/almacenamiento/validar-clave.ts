import { isAbsolute } from 'node:path';

/** Rechaza también sintaxis Windows aunque se ejecute en Linux. */
export function validarClaveAlmacenamiento(clave: string): void {
  if (!clave || isAbsolute(clave) || clave.includes('\u0000') || /[\\:]/.test(clave) ||
      clave.split('/').some((parte) => !parte || parte === '.' || parte === '..' || /[. ]$/.test(parte) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(parte))) {
    throw new Error('Clave de almacenamiento inválida.');
  }
}
