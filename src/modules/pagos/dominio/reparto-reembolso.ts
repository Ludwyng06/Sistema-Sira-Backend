import { ErrorDominio } from '../../../shared/errores/error-dominio.js';

export interface PagoReembolsable { id: string; valor: number; tipo: 'TOTAL' | 'ANTICIPO' | 'SALDO' }
/** Redondea una sola vez sobre lo pagado y reparte pesos exactos: saldo, anticipo, total. */
export function repartirReembolso(pagos: PagoReembolsable[], porcentaje: number) {
  if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100 || pagos.some((p) => !Number.isSafeInteger(p.valor) || p.valor < 0)) {
    throw new ErrorDominio('VALOR_INVALIDO', 'Los pagos o el porcentaje de reembolso no son válidos.', 422);
  }
  const pagado = pagos.reduce((suma, p) => suma + BigInt(p.valor), 0n);
  if (pagado > BigInt(Number.MAX_SAFE_INTEGER)) throw new ErrorDominio('VALOR_INVALIDO', 'El total pagado supera el rango de pesos enteros.', 422);
  const [coeficiente = '0', potencia = '0'] = String(porcentaje).toLowerCase().split('e');
  const [entero = '0', decimales = ''] = coeficiente.split('.');
  const exponente = Number(potencia) - decimales.length;
  const digitos = BigInt(entero + decimales);
  const numerador = exponente >= 0 ? digitos * 10n ** BigInt(exponente) : digitos;
  const denominador = exponente >= 0 ? 100n : 100n * 10n ** BigInt(-exponente);
  const valorReembolso = Number((pagado * numerador + denominador / 2n) / denominador);
  let restante = valorReembolso;
  const prioridad = { SALDO: 0, ANTICIPO: 1, TOTAL: 2 };
  const reparto: { ordenPagoId: string; valor: number }[] = [];
  for (const pago of [...pagos].sort((a, b) => prioridad[a.tipo] - prioridad[b.tipo] || a.id.localeCompare(b.id))) {
    const valor = Math.min(restante, pago.valor);
    if (valor > 0) reparto.push({ ordenPagoId: pago.id, valor });
    restante -= valor;
  }
  return { valorPagado: Number(pagado), valorReembolso, reparto };
}
