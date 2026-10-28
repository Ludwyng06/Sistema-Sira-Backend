import { SetMetadata } from '@nestjs/common';

export const CLAVE_AUDITAR = 'sira:auditar';

export interface OpcionesAuditar {
  accion: string;
  entidad: string;
}

/**
 * Registra en la bitácora, cuando el método termina bien, quién lo ejecutó y qué devolvió
 * (03-backend §8). Los servicios que ya escriben su propia bitácora dentro de la transacción no la usan.
 */
export const Auditar = (accion: string, entidad: string) =>
  SetMetadata(CLAVE_AUDITAR, { accion, entidad } satisfies OpcionesAuditar);
