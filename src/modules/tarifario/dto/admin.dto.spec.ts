import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { ActualizarRecargoDto } from './admin.dto.js';

const errores = async (plano: Record<string, unknown>) =>
  (await validate(plainToInstance(ActualizarRecargoDto, plano))).map((e) => e.property);

describe('ActualizarRecargoDto', () => {
  it.each([0, 20, 100, 125, 125.5, 299.99, 300])('acepta el porcentaje %s', async (porcentaje) => {
    expect(await errores({ porcentaje })).toEqual([]);
  });

  it('acepta el porcentaje enviado como texto', async () => {
    expect(await errores({ porcentaje: '150.25' })).toEqual([]);
  });

  it.each([300.01, 301, 1000])('rechaza el porcentaje %s por superar 300', async (porcentaje) => {
    expect(await errores({ porcentaje })).toContain('porcentaje');
  });

  it.each([-0.01, -1, -300])('rechaza el porcentaje negativo %s', async (porcentaje) => {
    expect(await errores({ porcentaje })).toContain('porcentaje');
  });

  it('rechaza más de dos decimales', async () => {
    expect(await errores({ porcentaje: 12.345 })).toContain('porcentaje');
  });

  it('el mensaje indica el límite de 300', async () => {
    const [error] = await validate(plainToInstance(ActualizarRecargoDto, { porcentaje: 300.01 }));
    expect(Object.values(error?.constraints ?? {})).toContain('porcentaje no puede superar 300.');
  });

  it('valida el formato de desdeHora', async () => {
    expect(await errores({ desdeHora: '19:30' })).toEqual([]);
    expect(await errores({ desdeHora: '25:00' })).toContain('desdeHora');
  });
});
