import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { describe, expect, it } from 'vitest';
import { RegistroDto } from './registro.dto.js';

describe('RegistroDto.numeroDocumento', () => {
  it('se normaliza a mayúsculas y sin espacios para que no se eluda la unicidad por documento', () => {
    const a = plainToInstance(RegistroDto, { numeroDocumento: ' ab-1234 ' });
    const b = plainToInstance(RegistroDto, { numeroDocumento: 'AB-1234' });
    expect(a.numeroDocumento).toBe('AB-1234');
    expect(a.numeroDocumento).toBe(b.numeroDocumento);
  });
});
