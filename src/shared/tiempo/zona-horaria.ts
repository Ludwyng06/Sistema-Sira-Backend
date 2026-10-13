/**
 * Utilidades de tiempo. En BD y API todo es UTC; `America/Bogota` solo se usa
 * para decidir "qué día es" y para contar días hábiles.
 */
const ZONA = 'America/Bogota';
const MS_DIA = 24 * 60 * 60 * 1000;

const formatoFecha = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const formatoDia = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, weekday: 'short' });
const DIAS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Fecha calendario en Bogotá como `YYYY-MM-DD`. */
export function fechaLocal(fecha: Date): string {
  return formatoFecha.format(fecha);
}

/** Día de la semana en Bogotá: 0 = domingo … 6 = sábado. */
export function diaSemanaLocal(fecha: Date): number {
  return DIAS[formatoDia.format(fecha)];
}

/**
 * Cuenta los días hábiles (lunes a viernes, sin festivos) posteriores al día
 * de `desde` y hasta el día de `hasta`, este último incluido. `festivos` son
 * fechas `YYYY-MM-DD`. Si `hasta` no es posterior a `desde`, devuelve 0.
 */
export function diasHabilesEntre(
  desde: Date,
  hasta: Date,
  festivos: Iterable<string> = [],
): number {
  const setFestivos = new Set(festivos);
  const fin = Date.parse(`${fechaLocal(hasta)}T12:00:00Z`);
  let total = 0;
  for (let cursor = Date.parse(`${fechaLocal(desde)}T12:00:00Z`) + MS_DIA; cursor <= fin; cursor += MS_DIA) {
    const dia = new Date(cursor);
    const diaSemana = dia.getUTCDay();
    const iso = dia.toISOString().slice(0, 10);
    if (diaSemana !== 0 && diaSemana !== 6 && !setFestivos.has(iso)) total += 1;
  }
  return total;
}
