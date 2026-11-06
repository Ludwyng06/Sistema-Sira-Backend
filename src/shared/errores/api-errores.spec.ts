import { DECORATORS } from '@nestjs/swagger';
import { describe, expect, it } from 'vitest';
import { ApiErrores, DESCRIPCION_POR_ESTADO } from './api-errores.js';
import { RespuestaErrorDto } from './respuesta-error.dto.js';

describe('ApiErrores', () => {
  it('documenta cada estado con el DTO y su descripción', () => {
    class ControladorPrueba {
      @ApiErrores(400, 501)
      metodo(): void {}
    }

    const respuestas = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      ControladorPrueba.prototype.metodo,
    ) as Record<string, { description: string; type: unknown }>;

    expect(respuestas).toHaveProperty('400');
    expect(respuestas['400']).toMatchObject({
      description: DESCRIPCION_POR_ESTADO[400],
      type: RespuestaErrorDto,
    });
    expect(respuestas).toHaveProperty('501');
    expect(respuestas['501']).toMatchObject({
      description: DESCRIPCION_POR_ESTADO[501],
      type: RespuestaErrorDto,
    });
  });

  it('documenta el estado 503 con el DTO de error', () => {
    class ControladorPrueba {
      @ApiErrores(503)
      metodo(): void {}
    }

    const respuestas = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      ControladorPrueba.prototype.metodo,
    ) as Record<string, { description: string; type: unknown }>;

    expect(respuestas['503']).toMatchObject({
      description: 'Servicio externo no disponible, por ejemplo el correo.',
      type: RespuestaErrorDto,
    });
  });

  it('falla temprano si un estado no tiene descripción', () => {
    expect(() => ApiErrores(418)).toThrow(
      'No hay una descripción de error definida para el estado HTTP 418.',
    );
  });
});
