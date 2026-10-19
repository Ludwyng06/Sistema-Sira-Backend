import type { TransformFnParams } from 'class-transformer';

/** Convierte «true» y «false» de la cadena de consulta; deja cualquier otro valor para que lo valide el DTO. */
export function aBooleano({ value }: TransformFnParams): unknown {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
}
