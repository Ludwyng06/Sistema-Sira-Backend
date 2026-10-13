import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { TipoConsecutivo } from '../../generated/prisma/enums.js';
import { fechaLocal } from '../tiempo/zona-horaria.js';

const FORMATO: Record<TipoConsecutivo, { prefijo: string; digitos: number }> = {
  SOLICITUD: { prefijo: 'SOL', digitos: 4 },
  COTIZACION: { prefijo: 'COT', digitos: 4 },
  ORDEN_PAGO: { prefijo: 'OP', digitos: 6 },
  ACTA: { prefijo: 'ACT', digitos: 4 },
};

/** RN-17: consecutivos únicos, secuenciales y nunca reutilizados. */
@Injectable()
export class ConsecutivoService {
  /**
   * Toma el siguiente número DENTRO de la transacción `tx`: si la transacción
   * se revierte, el número no se consume. Ej.: `SOL-2026-0001`.
   */
  async siguiente(tx: Prisma.TransactionClient, tipo: TipoConsecutivo): Promise<string> {
    const anio = Number(fechaLocal(new Date()).slice(0, 4));
    const filas = await tx.$queryRaw<{ ultimo: number }[]>`
      INSERT INTO consecutivo (tipo, anio, ultimo)
      VALUES (${tipo}::"TipoConsecutivo", ${anio}, 1)
      ON CONFLICT (tipo, anio) DO UPDATE SET ultimo = consecutivo.ultimo + 1
      RETURNING ultimo`;
    const { prefijo, digitos } = FORMATO[tipo];
    return `${prefijo}-${anio}-${String(filas[0].ultimo).padStart(digitos, '0')}`;
  }
}
