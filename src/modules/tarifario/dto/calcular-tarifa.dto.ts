import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsUUID } from 'class-validator';
import { TipoSolicitante } from '../../../generated/prisma/enums.js';

export const TIPOS_SOLICITANTE_EXTERNO = [
  TipoSolicitante.PERSONA_NATURAL,
  TipoSolicitante.EMPRESA,
  TipoSolicitante.ENTIDAD,
] as const;

export class CalcularTarifaDto {
  @ApiProperty({ format: 'uuid', example: '8a3b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b', description: 'Espacio a cotizar.' })
  @IsUUID('all', { message: 'espacioId debe ser un identificador válido.' })
  espacioId!: string;

  @ApiProperty({
    enum: TIPOS_SOLICITANTE_EXTERNO,
    example: TipoSolicitante.EMPRESA,
    description: 'Tipo de solicitante externo. La tarifa interna no se publica.',
  })
  @IsIn(TIPOS_SOLICITANTE_EXTERNO, { message: 'tipoSolicitante no es válido para el simulador.' })
  tipoSolicitante!: (typeof TIPOS_SOLICITANTE_EXTERNO)[number];

  @ApiProperty({ example: '2026-11-03T13:00:00.000Z', description: 'Inicio del evento (ISO 8601, UTC).' })
  @IsISO8601({ strict: true }, { message: 'inicio debe ser una fecha ISO 8601 válida.' })
  inicio!: string;

  @ApiProperty({ example: '2026-11-03T17:00:00.000Z', description: 'Fin del evento (ISO 8601, UTC).' })
  @IsISO8601({ strict: true }, { message: 'fin debe ser una fecha ISO 8601 válida.' })
  fin!: string;
}
