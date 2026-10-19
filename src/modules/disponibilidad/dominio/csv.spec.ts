import { describe, expect, it } from 'vitest';
import { leerCsv } from './csv.js';

describe('leerCsv', () => {
  it('lee encabezados en minúsculas y filas con su número de línea', () => {
    const r = leerCsv('Espacio,Dia\nA-101,LUN\nB-202,MAR\n');
    expect(r.encabezados).toEqual(['espacio', 'dia']);
    expect(r.filas).toEqual([
      { linea: 2, valores: { espacio: 'A-101', dia: 'LUN' } },
      { linea: 3, valores: { espacio: 'B-202', dia: 'MAR' } },
    ]);
  });

  it('detecta el punto y coma de Excel y tolera CRLF y BOM', () => {
    const r = leerCsv('﻿espacio;dia\r\nA-101;LUN\r\n');
    expect(r.filas).toEqual([{ linea: 2, valores: { espacio: 'A-101', dia: 'LUN' } }]);
  });

  it('respeta comillas, comas internas, comillas escapadas y saltos de línea dentro del campo', () => {
    const r = leerCsv('espacio,descripcion\nA-101,"Cálculo, grupo ""A"""\nB-1,"línea 1\nlínea 2"\nC-3,fin\n');
    expect(r.filas[0]?.valores.descripcion).toBe('Cálculo, grupo "A"');
    expect(r.filas[1]?.valores.descripcion).toBe('línea 1\nlínea 2');
    expect(r.filas[2]).toEqual({ linea: 5, valores: { espacio: 'C-3', descripcion: 'fin' } });
  });

  it('ignora filas vacías y completa con vacío las columnas que faltan', () => {
    const r = leerCsv('a,b,c\n\n1,2\n  ,  ,  \n');
    expect(r.filas).toEqual([{ linea: 3, valores: { a: '1', b: '2', c: '' } }]);
  });

  it('un archivo vacío no tiene encabezados ni filas', () => {
    expect(leerCsv('')).toEqual({ encabezados: [], filas: [] });
  });
});
