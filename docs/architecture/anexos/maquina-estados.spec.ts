import { describe, expect, it } from 'vitest';
import {
  ESTADOS_TERMINALES,
  TransicionInvalida,
  eventosPermitidos,
  validarTransicion,
} from './maquina-estados.js';

describe('Máquina de estados de la solicitud', () => {
  it('recorre el flujo de un externo de punta a punta', () => {
    let estado = validarTransicion('BORRADOR', 'ENVIAR');
    estado = validarTransicion(estado, 'ENRUTAR');
    estado = validarTransicion(estado, 'APROBAR');
    estado = validarTransicion(estado, 'GENERAR_ORDEN_PAGO');
    estado = validarTransicion(estado, 'CONFIRMAR_PAGO');
    estado = validarTransicion(estado, 'ENTREGAR');
    estado = validarTransicion(estado, 'DEVOLVER_ESPACIO');
    estado = validarTransicion(estado, 'CERRAR');
    expect(estado).toBe('CERRADA');
  });

  it('una exenta pasa de COTIZADA a CONFIRMADA sin pago (RN-08)', () => {
    expect(validarTransicion('COTIZADA', 'APROBAR_EXENTA')).toBe('CONFIRMADA');
  });

  it('una devuelta vuelve a BORRADOR para corregir y reenviar', () => {
    expect(validarTransicion('EN_REVISION', 'DEVOLVER')).toBe('BORRADOR');
  });

  it('el pago tardío puede reactivar una vencida (RN-02d)', () => {
    expect(validarTransicion('VENCIDA', 'CONFIRMAR_PAGO_TARDIO')).toBe('CONFIRMADA');
  });

  it('no se puede confirmar un pago sin haber pasado por orden de pago', () => {
    expect(() => validarTransicion('COTIZADA', 'CONFIRMAR_PAGO')).toThrow(TransicionInvalida);
  });

  it('no se puede cerrar sin acta de devolución (RN-15)', () => {
    expect(() => validarTransicion('EN_USO', 'CERRAR')).toThrow(TransicionInvalida);
  });

  it('una solicitud confirmada no puede vencer', () => {
    expect(() => validarTransicion('CONFIRMADA', 'VENCER')).toThrow(TransicionInvalida);
  });

  it('los estados terminales no admiten ningún evento', () => {
    for (const estado of ESTADOS_TERMINALES) {
      expect(eventosPermitidos(estado)).toEqual([]);
    }
  });
});
