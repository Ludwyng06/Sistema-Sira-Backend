/** Motivo legible del reembolso que se registra al cancelar (visible para el solicitante y Tesorería). */
export function motivoReembolso(institucional: boolean, porcentaje: number, diasDeAntelacion: number | null): string {
  if (institucional) return `Cancelación por la institución: ${porcentaje} %`;
  const antelacion = diasDeAntelacion === null ? '' : ` (${diasDeAntelacion} día${diasDeAntelacion === 1 ? '' : 's'} de antelación)`;
  return `Cancelación por el solicitante: ${porcentaje} % según política${antelacion}`;
}
