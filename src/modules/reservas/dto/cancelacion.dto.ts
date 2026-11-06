import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { EstadoSolicitud } from '../../../generated/prisma/enums.js';

export class CancelarSolicitudDto {
  @ApiProperty({ example: 'El evento se canceló por falta de asistentes.', maxLength: 500 })
  @IsString({ message: 'motivo debe ser texto.' })
  @IsNotEmpty({ message: 'Indica el motivo de la cancelación.' })
  @MaxLength(500, { message: 'motivo no puede superar 500 caracteres.' })
  motivo!: string;
}

export class CancelacionDto {
  @ApiProperty({ enum: EstadoSolicitud, example: EstadoSolicitud.CANCELADA })
  estadoSolicitud!: EstadoSolicitud;

  @ApiProperty({
    example: 50,
    description:
      'Porcentaje reembolsable según la política y los días de antelación; ' +
      '100 si la causa es institucional.',
  })
  porcentajeReembolso!: number;

  @ApiProperty({ example: 125000, description: 'Valor a reembolsar en pesos enteros. 0 si no hubo cobro.' })
  valorReembolso!: number;

  @ApiProperty({ example: false })
  canceladaPorInstitucion!: boolean;
}

export class SimulacionCancelacionDto {
  @ApiProperty({ example: 5, description: 'Días completos de antelación respecto al primer tramo reservado.' })
  diasDeAntelacion!: number;

  @ApiProperty({ example: 100, description: 'Porcentaje reembolsable según RN-14 (100, 50 o 0).' })
  porcentajeReembolso!: number;

  @ApiProperty({ example: 180000, description: 'Valor estimado a reembolsar en pesos enteros.' })
  valorReembolso!: number;

  @ApiProperty({ example: false })
  canceladaPorInstitucion!: boolean;
}

export class CerrarSolicitudDto {
  @ApiPropertyOptional({
    example: 'Espacio recibido a conformidad; depósito autorizado para devolución.',
    maxLength: 500,
    description: 'Observación de cierre sobre la devolución del depósito o liquidación de novedades (RN-13, RN-15).',
  })
  @IsOptional()
  @IsString({ message: 'observacion debe ser texto.' })
  @MaxLength(500, { message: 'observacion no puede superar 500 caracteres.' })
  observacion?: string;
}

export class CierreSolicitudDto {
  @ApiProperty({ enum: EstadoSolicitud, example: EstadoSolicitud.CERRADA })
  estadoSolicitud!: EstadoSolicitud;

  @ApiProperty({ example: 'ACT-2026-00012' })
  actaDevolucion!: string;

  @ApiProperty({ type: String, nullable: true })
  observacion!: string | null;
}

