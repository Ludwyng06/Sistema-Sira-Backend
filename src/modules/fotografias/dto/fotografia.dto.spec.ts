import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { SubirFotoDto } from './fotografia.dto.js';

const validar = (plano: Record<string, unknown>) => validate(plainToInstance(SubirFotoDto, plano));

describe('SubirFotoDto', () => {
  it('rechaza un texto alternativo de solo espacios', async () => {
    const errores = await validar({ textoAlternativo: '    ' });
    expect(errores.map((e) => e.property)).toContain('textoAlternativo');
  });

  it('recorta los espacios del texto alternativo', async () => {
    const dto = plainToInstance(SubirFotoDto, { textoAlternativo: '  Vista frontal  ' });
    expect(dto.textoAlternativo).toBe('Vista frontal');
    expect(await validate(dto)).toHaveLength(0);
  });

  it('interpreta los campos multipart como texto', async () => {
    const dto = plainToInstance(SubirFotoDto, { textoAlternativo: 'x', esPortada: 'true', orden: '3' });
    expect(dto).toMatchObject({ esPortada: true, orden: 3 });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza un orden negativo o fuera de rango', async () => {
    expect((await validar({ textoAlternativo: 'x', orden: '-1' })).length).toBeGreaterThan(0);
    expect((await validar({ textoAlternativo: 'x', orden: '1000' })).length).toBeGreaterThan(0);
  });
});
