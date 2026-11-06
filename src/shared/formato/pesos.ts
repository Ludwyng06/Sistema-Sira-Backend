const FORMATO = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

/** Pesos para textos al usuario (RNF-13): `$333.000`. */
export function formatearPesos(valor: number): string {
  return FORMATO.format(valor).replace(/\s/g, '');
}
