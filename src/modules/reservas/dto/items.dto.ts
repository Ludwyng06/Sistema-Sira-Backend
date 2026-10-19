import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { EstadoConfirmacionServicio } from '../../../generated/prisma/enums.js';

export class AgregarReservaDto {
  @ApiProperty({ format: 'uuid', example: '8a3b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b', description: 'Espacio a reservar.' })
  @IsUUID('all', { message: 'espacioId debe ser un identificador válido.' })
  espacioId!: string;

  @ApiProperty({ example: '2026-11-03T13:00:00.000Z', description: 'Inicio del evento (ISO 8601, UTC).' })
  @IsISO8601({ strict: true }, { message: 'inicio debe ser una fecha ISO 8601 válida.' })
  inicio!: string;

  @ApiProperty({ example: '2026-11-03T17:00:00.000Z', description: 'Fin del evento (ISO 8601, UTC).' })
  @IsISO8601({ strict: true }, { message: 'fin debe ser una fecha ISO 8601 válida.' })
  fin!: string;
}

export class AgregarServicioDto {
  @ApiProperty({ format: 'uuid', example: '4d1b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b' })
  @IsUUID('all', { message: 'servicioId debe ser un identificador válido.' })
  servicioId!: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: 10000 })
  @Type(() => Number)
  @IsInt({ message: 'cantidad debe ser un número entero.' })
  @Min(1, { message: 'cantidad debe ser al menos 1.' })
  @Max(10_000, { message: 'cantidad no puede superar 10000.' })
  cantidad!: number;

  @ApiPropertyOptional({ example: 'Necesito el equipo a las 7:30.', maxLength: 300 })
  @IsOptional()
  @IsString({ message: 'observaciones debe ser texto.' })
  @MaxLength(300, { message: 'observaciones no puede superar 300 caracteres.' })
  observaciones?: string;
}

export class ReservaItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  espacioId!: string;

  @ApiProperty({ example: '2026-11-03T13:00:00.000Z' })
  inicio!: string;

  @ApiProperty({ example: '2026-11-03T17:00:00.000Z' })
  fin!: string;

  @ApiProperty({ type: String, nullable: true, example: 'HORA', description: 'Unidad de cobro estimada.' })
  unidad!: string | null;

  @ApiProperty({ example: 4, description: 'Unidades estimadas.' })
  cantidad!: number;

  @ApiProperty({ example: 20000, description: 'Valor por unidad estimado, en pesos enteros.' })
  valorUnitario!: number;

  @ApiProperty({ example: 0, description: 'Recargos estimados, en pesos enteros.' })
  recargos!: number;

  @ApiProperty({ example: 80000, description: 'Valor estimado del ítem, en pesos enteros. No es la cotización.' })
  subtotal!: number;
}

export class ServicioItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  servicioId!: string;

  @ApiProperty({ example: 'Sonido profesional' })
  nombre!: string;

  @ApiProperty({ example: 1 })
  cantidad!: number;

  @ApiProperty({ example: 150000, description: 'Valor unitario estimado, en pesos enteros.' })
  valorUnitario!: number;

  @ApiProperty({ example: 150000 })
  subtotal!: number;

  @ApiProperty({ enum: EstadoConfirmacionServicio, example: EstadoConfirmacionServicio.PENDIENTE })
  estadoConfirmacion!: EstadoConfirmacionServicio;

  @ApiProperty({ type: String, nullable: true })
  observaciones!: string | null;
}
