/**
 * RN-18 extendida (aporte del equipo, ver docs/architecture/07 · E2).
 *
 * Funciones PURAS: no tocan la base de datos, así se prueban fácil y se pueden
 * reutilizar en disponibilidad, reservas y en el frontend.
 */

export type NivelAforo = 'NO_CABE' | 'ADECUADO' | 'SOBRA_ESPACIO';

export interface EvaluacionAforo {
  nivel: NivelAforo;
  /** Porcentaje de ocupación del espacio con ese número de asistentes. */
  ocupacion: number;
  mensaje: string;
}

/**
 * Por debajo de este porcentaje, un espacio "grande" se considera
 * desproporcionado para el grupo. ⚠️ Supuesto por confirmar: 30 %.
 */
export const UMBRAL_SOBRA_ESPACIO = 0.3;

/** A partir de esta capacidad un espacio se considera grande (auditorios, coliseos). */
export const CAPACIDAD_ESPACIO_GRANDE = 80;

export function evaluarAforo(capacidad: number, asistentes: number): EvaluacionAforo {
  if (capacidad <= 0) throw new Error('La capacidad debe ser mayor que cero.');
  if (asistentes <= 0) throw new Error('El número de asistentes debe ser mayor que cero.');

  const ocupacion = asistentes / capacidad;

  if (asistentes > capacidad) {
    return {
      nivel: 'NO_CABE',
      ocupacion,
      mensaje: `Este espacio tiene capacidad para ${capacidad} personas y tu evento es de ${asistentes}.`,
    };
  }

  if (capacidad >= CAPACIDAD_ESPACIO_GRANDE && ocupacion < UMBRAL_SOBRA_ESPACIO) {
    return {
      nivel: 'SOBRA_ESPACIO',
      ocupacion,
      mensaje: `Este espacio es para ${capacidad} personas. Para ${asistentes} puede haber opciones más adecuadas.`,
    };
  }

  return { nivel: 'ADECUADO', ocupacion, mensaje: `Capacidad suficiente para ${asistentes} personas.` };
}

/**
 * Ordena espacios para un número de asistentes: primero los que caben y se
 * ajustan mejor (menor capacidad sobrante), al final los que no caben.
 */
export function ordenarPorAjuste<T extends { capacidadPersonas: number }>(
  espacios: T[],
  asistentes: number,
): T[] {
  return [...espacios].sort((a, b) => {
    const aCabe = a.capacidadPersonas >= asistentes;
    const bCabe = b.capacidadPersonas >= asistentes;
    if (aCabe !== bCabe) return aCabe ? -1 : 1;
    return aCabe
      ? a.capacidadPersonas - b.capacidadPersonas
      : b.capacidadPersonas - a.capacidadPersonas;
  });
}
