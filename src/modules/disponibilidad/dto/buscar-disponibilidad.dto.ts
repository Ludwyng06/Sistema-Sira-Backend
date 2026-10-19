import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export class BuscarDisponibilidadDto {
  @ApiProperty({ example: '2026-11-03', description: 'Día del evento (AAAA-MM-DD, hora de Bogotá).' })
  @Matches(FORMATO_FECHA, { message: 'fecha debe tener el formato AAAA-MM-DD.' })
  fecha!: string;

  @ApiProperty({ example: '08:00', description: 'Hora de inicio (HH:MM, hora de Bogotá).' })
  @Matches(FORMATO_HORA, { message: 'horaInicio debe tener el formato HH:MM.' })
  horaInicio!: string;

  @ApiProperty({ example: '12:00', description: 'Hora de fin (HH:MM). Debe ser posterior a horaInicio.' })
  @Matches(FORMATO_HORA, { message: 'horaFin debe tener el formato HH:MM.' })
  horaFin!: string;

  @ApiProperty({ example: 40, minimum: 1, description: 'Número de asistentes: solo se listan espacios donde caben.' })
  @Type(() => Number)
  @IsInt({ message: 'asistentes debe ser un número entero.' })
  @Min(1, { message: 'asistentes debe ser al menos 1.' })
  @Max(100_000, { message: 'asistentes no puede superar 100000.' })
  asistentes!: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'Limita la búsqueda a una sede.' })
  @IsOptional()
  @IsUUID('all', { message: 'sedeId debe ser un identificador válido.' })
  sedeId?: string;
}
