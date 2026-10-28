import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
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
