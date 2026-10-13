import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { RespuestaErrorDto } from './respuesta-error.dto.js';

export const DESCRIPCION_POR_ESTADO: Readonly<Record<number, string>> = {
  400: 'Datos inválidos.',
  401: 'Sin sesión.',
  403: 'Sin permiso para la acción.',
  404: 'No existe o no es tuyo.',
  409: 'Conflicto de estado.',
  422: 'Regla de negocio.',
  429: 'Límite de peticiones.',
  501: 'Funcionalidad aún no implementada.',
};

export function ApiErrores(...estados: number[]) {
  const respuestas = estados.map((status) => {
    const description = DESCRIPCION_POR_ESTADO[status];
    if (description === undefined) {
      throw new Error(`No hay una descripción de error definida para el estado HTTP ${status}.`);
    }
    return ApiResponse({ status, description, type: RespuestaErrorDto });
  });

  return applyDecorators(...respuestas);
}
