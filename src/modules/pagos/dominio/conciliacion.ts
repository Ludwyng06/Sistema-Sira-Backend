import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import type { DiferenciaConciliacionDto, FilaConciliacionDto, TotalConciliacionDto } from '../dto/conciliacion.dto.js';

export interface FilaExtracto { referencia: string; valor: number; fecha: string }
export const MAXIMO_EXTRACTO = 2 * 1024 * 1024;
export function corteBogota(fecha: string): { desde: Date; hasta: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new ErrorDominio('FECHA_INVALIDA', 'Usa una fecha YYYY-MM-DD válida.', 400);
  const desde = new Date(`${fecha}T05:00:00.000Z`);
  if (!Number.isFinite(desde.getTime()) || desde.toISOString().slice(0, 10) !== fecha) throw new ErrorDominio('FECHA_INVALIDA', 'La fecha no existe.', 400);
  return { desde, hasta: new Date(desde.getTime() + 86400_000) };
}
/** RFC4180 acotado al archivo recibido: comillas dobles, comas y CRLF/LF. */
function celdasCsv(texto: string): string[][] {
  const filas: string[][] = []; let fila: string[] = []; let celda = ''; let comillas = false; let cerrada = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!;
    if (comillas) { if (c === '"') { if (texto[i + 1] === '"') { celda += '"'; i++; } else { comillas = false; cerrada = true; } } else celda += c; continue; }
    if (c === '"' && !celda && !cerrada) { comillas = true; continue; }
    if (c === ',' || c === '\n' || c === '\r') {
      fila.push(celda); celda = ''; cerrada = false;
      if (c !== ',') { if (fila.some((v) => v.trim())) filas.push(fila); fila = []; if (c === '\r' && texto[i + 1] === '\n') i++; }
    } else { if (cerrada || c === '"') throw new ErrorDominio('CSV_INVALIDO', 'Comillas inválidas en el CSV.', 422); celda += c; }
  }
  if (comillas) throw new ErrorDominio('CSV_INVALIDO', 'El CSV contiene comillas sin cerrar.', 422);
  fila.push(celda); if (fila.some((v) => v.trim())) filas.push(fila); return filas;
}
export function leerExtracto(contenido: Buffer, fecha: string): FilaExtracto[] {
  corteBogota(fecha);
  if (!contenido.length || contenido.length > MAXIMO_EXTRACTO) throw new ErrorDominio('EXTRACTO_INVALIDO', 'Adjunta un CSV de máximo 2 MB.', 422);
  let texto: string;
  try { texto = new TextDecoder('utf-8', { fatal: true }).decode(contenido).replace(/^\uFEFF/, ''); }
  catch { throw new ErrorDominio('CSV_INVALIDO', 'El CSV debe estar codificado en UTF-8.', 422); }
  const filas = celdasCsv(texto); const cabecera = filas.shift()?.map((c) => c.trim());
  if (cabecera?.join(',') !== 'referencia,valor,fecha') throw new ErrorDominio('CSV_INVALIDO', 'El encabezado debe ser referencia,valor,fecha.', 422);
  const vistas = new Set<string>();
  return filas.map((fila, i) => {
    const [referencia = '', valorTexto = '', dia = ''] = fila.map((c) => c.trim());
    const valor = Number(valorTexto);
    if (fila.length !== 3 || !/^[A-Za-z0-9_-]{1,120}$/.test(referencia) || !/^\d+$/.test(valorTexto) || !Number.isSafeInteger(valor) || valor <= 0 || dia !== fecha || vistas.has(referencia)) {
      throw new ErrorDominio('CSV_INVALIDO', `Revisa la fila ${i + 2}: referencia única, pesos enteros positivos y fecha del informe.`, 422);
    }
    vistas.add(referencia); return { referencia, valor, fecha: dia };
  });
}
export function compararExtracto(filas: FilaConciliacionDto[], extracto: FilaExtracto[], conocidas: FilaConciliacionDto[] = filas): DiferenciaConciliacionDto[] {
  const sistema = new Map(conocidas.map((f) => [f.referencia, f])); const enDia = new Set(filas.map((f) => f.referencia));
  const banco = new Set(extracto.map((f) => f.referencia)); const diferencias: DiferenciaConciliacionDto[] = [];
  for (const e of extracto) {
    const orden = sistema.get(e.referencia);
    if (!orden) { diferencias.push({ referencia: e.referencia, tipo: 'SIN_ORDEN', valorSistema: null, valorExtracto: e.valor, detalle: 'El extracto contiene una referencia sin orden en SIRA.' }); continue; }
    if (orden.valor !== e.valor) diferencias.push({ referencia: e.referencia, tipo: 'VALOR', valorSistema: orden.valor, valorExtracto: e.valor, detalle: 'El valor del extracto no coincide con la orden.' });
    if (orden.estado !== 'APROBADA' || !orden.pagadoEn || !enDia.has(orden.referencia)) diferencias.push({ referencia: e.referencia, tipo: 'ESTADO', valorSistema: orden.valor, valorExtracto: e.valor, detalle: 'El extracto registra un abono sin pago aprobado por SIRA en este día.' });
  }
  for (const orden of filas) if (orden.estado === 'APROBADA' && !banco.has(orden.referencia)) diferencias.push({ referencia: orden.referencia, tipo: 'SIN_EXTRACTO', valorSistema: orden.valor, valorExtracto: null, detalle: 'Pago aprobado sin referencia en el extracto.' });
  return diferencias;
}
export function sumar(total: TotalConciliacionDto, valor: number): void {
  if (!Number.isSafeInteger(valor) || valor < 0 || !Number.isSafeInteger(total.valor + valor)) throw new ErrorDominio('TOTAL_FUERA_DE_RANGO', 'El total supera el rango permitido de pesos enteros.', 422);
  total.cantidad++; total.valor += valor;
}
