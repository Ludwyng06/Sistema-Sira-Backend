import { diaSemanaLocal, diasHabilesEntre, fechaLocal } from '../../../shared/tiempo/zona-horaria.js';

/**
 * Reglas de dominio de una franja de reserva: horario de operación del espacio y
 * anticipación mínima del tipo de espacio. Funciones puras, sin acceso a datos;
 * las comparten el borrador (items) y el envío, y la disponibilidad para el calendario.
 */
const MS_DIA = 86_400_000;
const OFFSET_BOGOTA = '-05:00';
/** Tope de días que se recorren buscando el primer día reservable. */
const MAXIMO_DIAS_BUSQUEDA = 3650;

const FORMATO_HORA = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Bogota',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Hora local de Bogotá como `HH:mm`. Con `esFin`, la medianoche se expresa como `24:00`. */
export function horaLocal(instante: Date, esFin = false): string {
  const hora = FORMATO_HORA.format(instante);
  return esFin && hora === '00:00' ? '24:00' : hora;
}

export interface HorarioDia {
  diaSemana: number;
  abre: string;
  cierra: string;
}

export interface TipoAnticipacion {
  anticipacionMinimaDias: number;
  anticipacionEnHabiles: boolean;
}

export interface ProblemaFranja {
  codigo: 'FUERA_DE_HORARIO' | 'ANTICIPACION_INSUFICIENTE';
  mensaje: string;
}

/**
 * Un espacio sin horario configurado no se restringe; con horario, los días sin fila están cerrados.
 * Devuelve el problema o `null` si la franja cabe en el horario.
 */
export function validarHorario(inicio: Date, fin: Date, horarios: readonly HorarioDia[]): ProblemaFranja | null {
  if (horarios.length === 0) return null;
  const horario = horarios.find((h) => h.diaSemana === diaSemanaLocal(inicio));
  if (horario && horaLocal(inicio) >= horario.abre && horaLocal(fin, true) <= horario.cierra) return null;
  return {
    codigo: 'FUERA_DE_HORARIO',
    mensaje: horario
      ? `El espacio opera de ${horario.abre} a ${horario.cierra} ese día.`
      : 'El espacio no opera el día seleccionado.',
  };
}

/** Días de anticipación que hay entre `ahora` y el día local de `inicio` (hábiles o corridos). */
export function diasDeAnticipacion(
  ahora: Date,
  inicio: Date,
  enHabiles: boolean,
  festivos: Iterable<string> = [],
): number {
  return enHabiles
    ? diasHabilesEntre(ahora, inicio, festivos)
    : Math.round(
        (Date.parse(`${fechaLocal(inicio)}T00:00:00Z`) - Date.parse(`${fechaLocal(ahora)}T00:00:00Z`)) / MS_DIA,
      );
}

/** Devuelve el problema de anticipación o `null` si la franja cumple la anticipación mínima del tipo. */
export function validarAnticipacion(
  ahora: Date,
  inicio: Date,
  tipo: TipoAnticipacion,
  festivos: Iterable<string> = [],
): ProblemaFranja | null {
  const minimo = tipo.anticipacionMinimaDias;
  if (diasDeAnticipacion(ahora, inicio, tipo.anticipacionEnHabiles, festivos) >= minimo) return null;
  return {
    codigo: 'ANTICIPACION_INSUFICIENTE',
    mensaje: `Este tipo de espacio se solicita con ${minimo} día${minimo === 1 ? '' : 's'}${
      tipo.anticipacionEnHabiles ? ' hábiles' : ''
    } de anticipación.`,
  };
}

/** Inicio (00:00 de Bogotá) del día local `YYYY-MM-DD`. */
function inicioDelDiaLocal(fecha: string): Date {
  return new Date(`${fecha}T00:00:00.000${OFFSET_BOGOTA}`);
}

/**
 * Primer instante en que puede empezar una franja: el inicio del primer día local de Bogotá
 * que ya cumple la anticipación mínima del tipo (con la misma regla de `validarAnticipacion`).
 */
export function primerInicioReservable(
  ahora: Date,
  tipo: TipoAnticipacion,
  festivos: Iterable<string> = [],
): Date {
  const setFestivos = new Set(festivos);
  const hoy = inicioDelDiaLocal(fechaLocal(ahora));
  for (let dias = 0; dias <= MAXIMO_DIAS_BUSQUEDA; dias += 1) {
    const candidato = inicioDelDiaLocal(fechaLocal(new Date(hoy.getTime() + dias * MS_DIA + MS_DIA / 2)));
    if (validarAnticipacion(ahora, candidato, tipo, setFestivos) === null) return candidato;
  }
  return inicioDelDiaLocal(fechaLocal(new Date(hoy.getTime() + MAXIMO_DIAS_BUSQUEDA * MS_DIA + MS_DIA / 2)));
}
