import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { EstadoSolicitud, ResultadoDecision, TipoDecision } from '../../../generated/prisma/enums.js';

export class DecidirSolicitudDto {
  @ApiProperty({
    enum: TipoDecision,
    example: TipoDecision.APROBACION,
    description: 'AVAL lo da el responsable del espacio; APROBACION lo da el aprobador de la dependencia.',
  })
  @IsEnum(TipoDecision, { message: 'tipo no es válido.' })
  tipo!: TipoDecision;

  @ApiProperty({
    enum: ResultadoDecision,
    example: ResultadoDecision.APROBADA,
    description: 'RECLASIFICADA solo aplica a la aprobación de una solicitud exenta.',
  })
  @IsEnum(ResultadoDecision, { message: 'resultado no es válido.' })
  resultado!: ResultadoDecision;

  @ApiPropertyOptional({
    example: 'El horario se cruza con una actividad institucional.',
    maxLength: 500,
    description: 'Obligatorio si el resultado no es APROBADA.',
  })
  @IsOptional()
  @IsString({ message: 'motivo debe ser texto.' })
  @MaxLength(500, { message: 'motivo no puede superar 500 caracteres.' })
  motivo?: string;
}

export class DecisionRegistradaDto {
  @ApiProperty({ format: 'uuid' })
  decisionId!: string;

  @ApiProperty({ enum: TipoDecision })
  tipo!: TipoDecision;

  @ApiProperty({ enum: ResultadoDecision })
  resultado!: ResultadoDecision;

  @ApiProperty({ enum: EstadoSolicitud, description: 'Estado de la solicitud tras la decisión.' })
  estadoSolicitud!: EstadoSolicitud;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'COT-2026-0001',
    description: 'Consecutivo de la cotización si la decisión la emitió.',
  })
  cotizacion!: string | null;
}
