/**
 * Motor de cálculo de tarifas de espacios (RN-05, RN-06). Funciones PURAS:
 * no tocan la base de datos; el servicio les entrega tarifas, festivos y recargos.
 *
 * Supuestos por confirmar con Jensen (no están en la documentación):
 *  - Las jornadas cubren MAÑANA 06:00–12:00, TARDE 12:00–18:00 y NOCHE 18:00–24:00.
 *  - Una franja que cruza medianoche se cobra día por día (hora de Bogotá).
 *  - La hora se cobra completa (se redondea hacia arriba por día).
 *  - El recargo nocturno aplica a las horas desde `desdeHora` y a las anteriores a las 06:00,
 *    de forma proporcional; dominical y festivo aplican a todo el día y no se acumulan
 *    entre sí (el festivo prevalece). El nocturno se suma al de día.
 *  - Los recargos y el IVA se calculan sobre el valor base y se redondean a pesos enteros.
 */
import type { TipoRecargo, UnidadCobroTarifa } from '../../../generated/prisma/enums.js';

const MS_HORA = 3_600_000;
const MS_DIA = 24 * MS_HORA;
const DESFASE_BOGOTA_MS = -5 * MS_HORA;
const HORA_FIN_MADRUGADA = 6;
const HORA_NOCHE_POR_DEFECTO = 18;

const JORNADAS: { unidad: UnidadCobroTarifa; desde: number; hasta: number }[] = [
  { unidad: 'JORNADA_MANANA', desde: 6, hasta: 12 },
  { unidad: 'JORNADA_TARDE', desde: 12, hasta: 18 },
  { unidad: 'JORNADA_NOCHE', desde: 18, hasta: 24 },
];

export interface TarifaVigente {
  unidad: UnidadCobroTarifa;
  /** Valor en pesos enteros, ya resuelto con el SMMLV si la tarifa está indexada. */
  valor: number;
  ivaAplica: boolean;
  porcentajeIva: number;
}

export interface RecargoConfigurado {
  porcentaje: number;
  /** Solo NOCTURNO: hora desde la que aplica ("18:00"). */
  desdeHora?: string | null;
}

export type RecargosConfigurados = Partial<Record<TipoRecargo, RecargoConfigurado>>;

export interface RecargoAplicado {
  tipo: TipoRecargo;
  porcentaje: number;
  valor: number;
}

export interface LineaTarifa {
  /** Día local de Bogotá (AAAA-MM-DD). */
  fecha: string;
  horas: number;
  unidad: UnidadCobroTarifa | 'JORNADAS';
  cantidad: number;
  base: number;
  recargos: RecargoAplicado[];
  subtotal: number;
}

export interface ResultadoTarifa {
  lineas: LineaTarifa[];
  base: number;
  recargos: number;
  subtotal: number;
  iva: number;
  total: number;
}

export class TarifaNoDefinidaError extends Error {
  constructor(public readonly fecha: string) {
    super(`No hay una tarifa que cubra el día ${fecha}.`);
  }
}

function aLocal(instante: Date): number {
  return instante.getTime() + DESFASE_BOGOTA_MS;
}

function fechaIso(msLocal: number): string {
  return new Date(msLocal).toISOString().slice(0, 10);
}

function solapamiento(desde: number, hasta: number, a: number, b: number): number {
  return Math.max(0, Math.min(hasta, b) - Math.max(desde, a));
}

function horaDecimal(texto: string | null | undefined): number {
  const coincidencia = /^(\d{1,2}):(\d{2})$/.exec(texto ?? '');
  if (!coincidencia) return HORA_NOCHE_POR_DEFECTO;
  return Number(coincidencia[1]) + Number(coincidencia[2]) / 60;
}

function mejorOpcion(
  tarifas: Map<UnidadCobroTarifa, TarifaVigente>,
  inicioHora: number,
  finHora: number,
): { unidad: UnidadCobroTarifa | 'JORNADAS'; cantidad: number; base: number; tarifas: TarifaVigente[] } | null {
  const duracion = finHora - inicioHora;
  const opciones: {
    unidad: UnidadCobroTarifa | 'JORNADAS';
    cantidad: number;
    base: number;
    tarifas: TarifaVigente[];
  }[] =
    [];

  const porHora = tarifas.get('HORA');
  if (porHora) {
    const cantidad = Math.ceil(duracion - 1e-9);
    opciones.push({ unidad: 'HORA', cantidad, base: cantidad * porHora.valor, tarifas: [porHora] });
  }

  const porDia = tarifas.get('DIA');
  if (porDia) opciones.push({ unidad: 'DIA', cantidad: 1, base: porDia.valor, tarifas: [porDia] });

  if (inicioHora >= HORA_FIN_MADRUGADA) {
    const necesarias = JORNADAS.filter((j) => solapamiento(inicioHora, finHora, j.desde, j.hasta) > 0);
    const aplicables = necesarias.map((j) => tarifas.get(j.unidad));
    if (necesarias.length > 0 && aplicables.every((t): t is TarifaVigente => t !== undefined)) {
      opciones.push({
        unidad: necesarias.length === 1 ? necesarias[0]!.unidad : 'JORNADAS',
        cantidad: necesarias.length,
        base: aplicables.reduce((suma, t) => suma + t.valor, 0),
        tarifas: aplicables,
      });
    }
  }

  if (opciones.length === 0) return null;
  return opciones.reduce((mejor, actual) => (actual.base < mejor.base ? actual : mejor));
}

export interface EntradaCalculo {
  inicio: Date;
  fin: Date;
  tarifas: TarifaVigente[];
  /** Fechas AAAA-MM-DD de días festivos. */
  festivos: ReadonlySet<string>;
  recargos: RecargosConfigurados;
}

export function calcularTarifaEspacio(entrada: EntradaCalculo): ResultadoTarifa {
  if (entrada.fin <= entrada.inicio) throw new Error('El fin debe ser posterior al inicio.');

  const porUnidad = new Map<UnidadCobroTarifa, TarifaVigente>(entrada.tarifas.map((t) => [t.unidad, t]));
  const inicioLocal = aLocal(entrada.inicio);
  const finLocal = aLocal(entrada.fin);
  const nocturno = entrada.recargos.NOCTURNO;
  const desdeNoche = horaDecimal(nocturno?.desdeHora);

  const lineas: LineaTarifa[] = [];
  let iva = 0;

  for (let dia = Math.floor(inicioLocal / MS_DIA) * MS_DIA; dia < finLocal; dia += MS_DIA) {
    const desde = (Math.max(inicioLocal, dia) - dia) / MS_HORA;
    const hasta = (Math.min(finLocal, dia + MS_DIA) - dia) / MS_HORA;
    const fecha = fechaIso(dia);

    const opcion = mejorOpcion(porUnidad, desde, hasta);
    if (!opcion) throw new TarifaNoDefinidaError(fecha);

    const recargos: RecargoAplicado[] = [];
    const esFestivo = entrada.festivos.has(fecha);
    const esDomingo = new Date(dia).getUTCDay() === 0;
    const recargoDia = esFestivo ? entrada.recargos.FESTIVO : esDomingo ? entrada.recargos.DOMINICAL : undefined;
    if (recargoDia) {
      const tipo: TipoRecargo = esFestivo ? 'FESTIVO' : 'DOMINICAL';
      recargos.push({
        tipo,
        porcentaje: recargoDia.porcentaje,
        valor: Math.round((opcion.base * recargoDia.porcentaje) / 100),
      });
    }
    if (nocturno) {
      // Si la hora configurada cae antes de las 06:00 los dos tramos se juntan: no se cuenta dos veces.
      const horasNocturnas =
        desdeNoche <= HORA_FIN_MADRUGADA
          ? hasta - desde
          : solapamiento(desde, hasta, 0, HORA_FIN_MADRUGADA) + solapamiento(desde, hasta, desdeNoche, 24);
      if (horasNocturnas > 0) {
        const fraccion = horasNocturnas / (hasta - desde);
        recargos.push({
          tipo: 'NOCTURNO',
          porcentaje: nocturno.porcentaje,
          valor: Math.round((opcion.base * fraccion * nocturno.porcentaje) / 100),
        });
      }
    }

    const totalRecargos = recargos.reduce((suma, r) => suma + r.valor, 0);
    const subtotal = opcion.base + totalRecargos;
    const unico = opcion.tarifas[0]!;
    if (unico.ivaAplica) iva += Math.round((subtotal * unico.porcentajeIva) / 100);

    lineas.push({
      fecha,
      horas: Math.round((hasta - desde) * 100) / 100,
      unidad: opcion.unidad,
      cantidad: opcion.cantidad,
      base: opcion.base,
      recargos,
      subtotal,
    });
  }

  const base = lineas.reduce((suma, l) => suma + l.base, 0);
  const subtotal = lineas.reduce((suma, l) => suma + l.subtotal, 0);
  return { lineas, base, recargos: subtotal - base, subtotal, iva, total: subtotal + iva };
}
