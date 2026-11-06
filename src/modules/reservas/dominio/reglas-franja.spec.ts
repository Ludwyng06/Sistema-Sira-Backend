import { describe, expect, it } from 'vitest';
import {
  diasDeAnticipacion,
  horaLocal,
  primerInicioReservable,
  validarAnticipacion,
  validarHorario,
} from './reglas-franja.js';

// Hora de Bogotá (UTC-5).
const bogota = (fecha: string, hhmm: string) => new Date(`${fecha}T${hhmm}:00-05:00`);

const LUNES_A_VIERNES = [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, abre: '07:00', cierra: '18:00' }));
const SABADO_MEDIO_DIA = { diaSemana: 6, abre: '08:00', cierra: '12:00' };

describe('horaLocal', () => {
  it('convierte a hora de Bogotá y expresa la medianoche de fin como 24:00', () => {
    expect(horaLocal(bogota('2026-11-03', '08:30'))).toBe('08:30');
    expect(horaLocal(bogota('2026-11-04', '00:00'))).toBe('00:00');
    expect(horaLocal(bogota('2026-11-04', '00:00'), true)).toBe('24:00');
  });
});

describe('validarHorario', () => {
  it('un espacio sin horario no tiene restricción', () => {
    expect(validarHorario(bogota('2026-11-01', '03:00'), bogota('2026-11-01', '23:00'), [])).toBeNull();
  });

  it('acepta una franja dentro del horario del día', () => {
    expect(validarHorario(bogota('2026-11-03', '07:00'), bogota('2026-11-03', '18:00'), LUNES_A_VIERNES)).toBeNull();
  });

  it('rechaza un domingo sin fila de horario: el espacio no opera', () => {
    expect(validarHorario(bogota('2026-11-01', '09:00'), bogota('2026-11-01', '11:00'), LUNES_A_VIERNES)).toEqual({
      codigo: 'FUERA_DE_HORARIO',
      mensaje: 'El espacio no opera el día seleccionado.',
    });
  });

  it('rechaza un sábado que termina después del cierre', () => {
    const horarios = [...LUNES_A_VIERNES, SABADO_MEDIO_DIA];
    expect(validarHorario(bogota('2026-11-07', '10:00'), bogota('2026-11-07', '19:00'), horarios)).toEqual({
      codigo: 'FUERA_DE_HORARIO',
      mensaje: 'El espacio opera de 08:00 a 12:00 ese día.',
    });
  });

  it('rechaza una franja que empieza antes de la apertura', () => {
    expect(validarHorario(bogota('2026-11-03', '06:00'), bogota('2026-11-03', '09:00'), LUNES_A_VIERNES)).toMatchObject({
      codigo: 'FUERA_DE_HORARIO',
      mensaje: 'El espacio opera de 07:00 a 18:00 ese día.',
    });
  });

  it('un cierre a las 24:00 admite una franja que termina a medianoche', () => {
    const horarios = [{ diaSemana: 2, abre: '00:00', cierra: '24:00' }];
    expect(validarHorario(bogota('2026-11-03', '20:00'), bogota('2026-11-04', '00:00'), horarios)).toBeNull();
  });
});

describe('anticipación', () => {
  // Jueves 22 de octubre de 2026.
  const AHORA = bogota('2026-10-22', '10:00');
  const habiles2 = { anticipacionMinimaDias: 2, anticipacionEnHabiles: true };
  const corridos2 = { anticipacionMinimaDias: 2, anticipacionEnHabiles: false };

  it('en hábiles salta el fin de semana: jueves + 2 hábiles es el lunes', () => {
    expect(diasDeAnticipacion(AHORA, bogota('2026-10-26', '08:00'), true)).toBe(2);
    expect(validarAnticipacion(AHORA, bogota('2026-10-26', '08:00'), habiles2)).toBeNull();
    expect(validarAnticipacion(AHORA, bogota('2026-10-25', '08:00'), habiles2)).toMatchObject({
      codigo: 'ANTICIPACION_INSUFICIENTE',
      mensaje: 'Este tipo de espacio se solicita con 2 días hábiles de anticipación.',
    });
  });

  it('un festivo de por medio no cuenta como hábil', () => {
    const festivos = ['2026-10-26'];
    expect(validarAnticipacion(AHORA, bogota('2026-10-26', '08:00'), habiles2, festivos)).not.toBeNull();
    expect(validarAnticipacion(AHORA, bogota('2026-10-27', '08:00'), habiles2, festivos)).toBeNull();
  });

  it('en días corridos cuenta sábados y domingos, y usa singular con un día', () => {
    expect(validarAnticipacion(AHORA, bogota('2026-10-24', '08:00'), corridos2)).toBeNull();
    expect(validarAnticipacion(AHORA, bogota('2026-10-23', '08:00'), corridos2)).toMatchObject({
      mensaje: 'Este tipo de espacio se solicita con 2 días de anticipación.',
    });
    expect(
      validarAnticipacion(AHORA, bogota('2026-10-22', '15:00'), { anticipacionMinimaDias: 1, anticipacionEnHabiles: false }),
    ).toMatchObject({ mensaje: 'Este tipo de espacio se solicita con 1 día de anticipación.' });
  });

  describe('primerInicioReservable', () => {
    it('hábiles con fin de semana: el lunes a las 00:00 de Bogotá', () => {
      const desde = primerInicioReservable(AHORA, habiles2);
      expect(desde.toISOString()).toBe('2026-10-26T05:00:00.000Z');
    });

    it('hábiles con festivo: salta al martes', () => {
      expect(primerInicioReservable(AHORA, habiles2, ['2026-10-26']).toISOString()).toBe('2026-10-27T05:00:00.000Z');
    });

    it('días corridos: hoy + mínimo', () => {
      expect(primerInicioReservable(AHORA, corridos2).toISOString()).toBe('2026-10-24T05:00:00.000Z');
    });

    it('sin anticipación mínima es el inicio del día de hoy en Bogotá', () => {
      const tarde = bogota('2026-10-22', '23:30');
      expect(primerInicioReservable(tarde, { anticipacionMinimaDias: 0, anticipacionEnHabiles: true }).toISOString()).toBe(
        '2026-10-22T05:00:00.000Z',
      );
    });

    it.each([
      ['hábiles', habiles2, []],
      ['hábiles con festivo', habiles2, ['2026-10-26']],
      ['corridos', corridos2, []],
    ])('es coherente con la validación (%s)', (_caso, tipo, festivos) => {
      const desde = primerInicioReservable(AHORA, tipo, festivos);
      expect(validarAnticipacion(AHORA, desde, tipo, festivos)).toBeNull();
      const diaAnterior = new Date(desde.getTime() - 12 * 3_600_000);
      expect(validarAnticipacion(AHORA, diaAnterior, tipo, festivos)).not.toBeNull();
    });
  });
});
