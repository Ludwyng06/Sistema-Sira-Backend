import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class ConsultaTableroDto {
  @ApiPropertyOptional({
    example: '2026-10-01T00:00:00.000Z',
    description: 'Inicio del periodo (ISO 8601, UTC). Por defecto, 30 días antes de «hasta».',
  })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'desde debe ser una fecha ISO 8601 válida.' })
  desde?: string;

  @ApiPropertyOptional({
    example: '2026-10-31T23:59:59.000Z',
    description: 'Fin del periodo (ISO 8601, UTC). Por defecto, ahora. El periodo máximo es de 366 días.',
  })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'hasta debe ser una fecha ISO 8601 válida.' })
  hasta?: string;
}

export class ConteoEstadoDto {
  @ApiProperty({ example: 'CONFIRMADA' })
  estado!: string;

  @ApiProperty({ example: 12 })
  cantidad!: number;
}

export class OcupacionEspacioDto {
  @ApiProperty({ format: 'uuid' })
  espacioId!: string;

  @ApiProperty({ example: 'B-101' })
  codigo!: string;

  @ApiProperty({ example: 'Aula B-101' })
  nombre!: string;

  @ApiProperty({ example: 42.5, description: 'Horas con reserva confirmada en el periodo.' })
  horasReservadas!: number;
}

export class OcupacionDto {
  @ApiProperty({ example: 320.5, description: 'Horas de reservas confirmadas (incluye montaje y desmontaje).' })
  horasReservadas!: number;

  @ApiProperty({ example: 810, description: 'Horas ocupadas por clases, mantenimientos y otros bloqueos.' })
  horasBloqueadas!: number;

  @ApiProperty({ type: [OcupacionEspacioDto], description: 'Los diez espacios con más horas reservadas.' })
  espaciosMasUsados!: OcupacionEspacioDto[];
}

export class RecaudoDto {
  @ApiProperty({
    example: 4500000,
    description: 'Pesos enteros de órdenes aprobadas en el periodo (incluye depósitos).',
  })
  total!: number;

  @ApiProperty({ example: 9 })
  ordenesAprobadas!: number;
}

export class UsoInternoDto {
  @ApiProperty({ example: 2300000, description: 'Valor de referencia de las reservas exentas cotizadas.' })
  valorReferencia!: number;

  @ApiProperty({ example: 14 })
  solicitudesExentas!: number;
}

export class TableroDto {
  @ApiProperty({ example: '2026-10-01T00:00:00.000Z' })
  desde!: string;

  @ApiProperty({ example: '2026-10-31T23:59:59.000Z' })
  hasta!: string;

  @ApiProperty({ type: [ConteoEstadoDto], description: 'Solicitudes creadas en el periodo, por estado.' })
  solicitudesPorEstado!: ConteoEstadoDto[];

  @ApiProperty({ type: OcupacionDto })
  ocupacion!: OcupacionDto;

  @ApiProperty({ type: RecaudoDto })
  recaudo!: RecaudoDto;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 31.4,
    description: 'Horas promedio entre el envío y la aprobación final. Null si no hubo aprobaciones.',
  })
  tiempoMedioAprobacionHoras!: number | null;

  @ApiProperty({ type: UsoInternoDto })
  usoInternoNoCobrado!: UsoInternoDto;
}
