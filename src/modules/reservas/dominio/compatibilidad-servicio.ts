/**
 * RF-SVC-04: un servicio puede restringirse a ciertos tipos de espacio. Es compatible con una
 * solicitud si no tiene restricción (lista vacía) o si permite el tipo de AL MENOS UNO de los
 * espacios de sus reservas.
 */
export function servicioCompatible(
  tiposPermitidos: readonly string[],
  tiposDeLosEspacios: readonly string[],
): boolean {
  if (tiposPermitidos.length === 0) return true;
  return tiposDeLosEspacios.some((tipo) => tiposPermitidos.includes(tipo));
}
