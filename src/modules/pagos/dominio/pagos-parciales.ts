import { ErrorDominio } from '../../../shared/errores/error-dominio.js';

export function distribuirPago(total: number, porcentaje: number): { tipo: 'TOTAL' | 'ANTICIPO'; anticipo: number; saldo: number } {
  if (!Number.isSafeInteger(total) || total <= 0) throw new ErrorDominio('VALOR_INVALIDO', 'El total debe ser un valor positivo en pesos enteros.', 422);
  if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100 || !/^\d+(?:\.\d{1,2})?$/.test(String(porcentaje))) {
    throw new ErrorDominio('PARAMETRO_INVALIDO', 'PORCENTAJE_ANTICIPO debe estar entre 0 y 100, con hasta dos decimales.', 422);
  }
  if (porcentaje === 0) return { tipo: 'TOTAL', anticipo: total, saldo: 0 };
  const [entero = '0', fraccion = ''] = String(porcentaje).split('.');
  const centesimas = BigInt(entero) * 100n + BigInt(fraccion.padEnd(2, '0'));
  const anticipo = Number((BigInt(total) * centesimas + 5000n) / 10000n);
  if (anticipo === 0) throw new ErrorDominio('ANTICIPO_SIN_VALOR', 'El anticipo redondeado es menor de un peso; revisa el porcentaje.', 422);
  return { tipo: 'ANTICIPO', anticipo, saldo: total - anticipo };
}
export function vencimientoSaldo(inicio: Date, dias: number): Date {
  if (!Number.isInteger(dias) || dias < 0 || dias > 365) throw new ErrorDominio('PARAMETRO_INVALIDO', 'DIAS_SALDO_ANTES_EVENTO debe estar entre 0 y 365.', 422);
  if (!Number.isFinite(inicio.getTime())) throw new ErrorDominio('FECHA_INVALIDA', 'La primera franja no tiene fecha válida.', 422);
  return new Date(inicio.getTime() - dias * 86400_000);
}
