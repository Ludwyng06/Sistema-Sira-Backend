import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { OrigenFranja } from '../../../generated/prisma/enums.js';

export class CrearBloqueoDto {
  @ApiProperty({ format: 'uuid', example: '8a3b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b', description: 'Espacio a bloquear.' })
  @IsUUID('all', { message: 'espacioId debe ser un identificador válido.' })
  espacioId!: string;

  @ApiProperty({
    enum: OrigenFranja,
    example: OrigenFranja.MANTENIMIENTO,
    description: 'Motivo del bloqueo. RESERVA no es válido: las reservas nacen de una solicitud.',
  })
  @IsEnum(OrigenFranja, { message: 'motivo no es válido.' })
  motivo!: OrigenFranja;

  @ApiPropertyOptional({ example: 'Mantenimiento del aire acondicionado', maxLength: 300 })
  @IsOptional()
  @IsString({ message: 'descripcion debe ser texto.' })
  @MaxLength(300, { message: 'descripcion no puede superar 300 caracteres.' })
  descripcion?: string;

  @ApiPropertyOptional({
    example: 'Clase de Cálculo',
    maxLength: 120,
    description: 'Texto que verá el público en el calendario. Si falta, se muestra «Ocupado».',
  })
  @IsOptional()
  @IsString({ message: 'etiquetaPublica debe ser texto.' })
  @MaxLength(120, { message: 'etiquetaPublica no puede superar 120 caracteres.' })
  etiquetaPublica?: string;

  @ApiProperty({ example: '2026-11-03T13:00:00.000Z', description: 'Inicio de la primera ocurrencia (UTC).' })
  @IsISO8601({ strict: true }, { message: 'inicio debe ser una fecha ISO 8601 válida.' })
  inicio!: string;

  @ApiProperty({ example: '2026-11-03T15:00:00.000Z', description: 'Fin de la primera ocurrencia (UTC).' })
  @IsISO8601({ strict: true }, { message: 'fin debe ser una fecha ISO 8601 válida.' })
  fin!: string;

  @ApiPropertyOptional({
    example: 'FREQ=WEEKLY;BYDAY=MO,WE',
    description: 'Regla de recurrencia RRULE (iCalendar) sin el prefijo «RRULE:». Exige repetirHasta.',
  })
  @IsOptional()
  @IsString({ message: 'rrule debe ser texto.' })
  @MaxLength(200, { message: 'rrule no puede superar 200 caracteres.' })
  rrule?: string;

  @ApiPropertyOptional({
    example: '2026-12-11T00:00:00.000Z',
    description: 'Fecha hasta la que se expande la recurrencia (UTC).',
  })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'repetirHasta debe ser una fecha ISO 8601 válida.' })
  repetirHasta?: string;
}
