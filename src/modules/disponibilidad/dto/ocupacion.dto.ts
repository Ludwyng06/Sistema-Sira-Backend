import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ConsultaOcupacionDto {
  @ApiProperty({ example: 'MOC', description: 'Código de la sede.' })
  @IsString({ message: 'sede debe ser texto.' })
  @IsNotEmpty({ message: 'sede es obligatoria.' })
  sede!: string;

  @ApiPropertyOptional({ example: 'A', description: 'Código del bloque dentro de la sede.' })
  @IsOptional()
  @IsString({ message: 'bloque debe ser texto.' })
  bloque?: string;

  @ApiProperty({ example: '2026-11-02T05:00:00.000Z', description: 'Inicio del rango (ISO 8601, UTC).' })
  @IsISO8601({ strict: true }, { message: 'desde debe ser una fecha ISO 8601 válida.' })
  desde!: string;

  @ApiProperty({ example: '2026-11-09T05:00:00.000Z', description: 'Fin del rango (ISO 8601, UTC). Máximo 31 días.' })
  @IsISO8601({ strict: true }, { message: 'hasta debe ser una fecha ISO 8601 válida.' })
  hasta!: string;
}

export class OcupacionEspacioSedeDto {
  @ApiProperty({ example: 'A-101' })
  codigo!: string;

  @ApiProperty({ example: 'Aula A-101' })
  nombre!: string;

  @ApiProperty({ example: 98, description: 'Horas de operación del espacio dentro del rango.' })
  horasOperacion!: number;

  @ApiProperty({ example: 41.5, description: 'Horas con reserva, retención o bloqueo dentro del rango.' })
  horasOcupadas!: number;

  @ApiProperty({ example: 42.35, description: 'Horas ocupadas sobre horas de operación (tope 100).' })
  porcentajeOcupacion!: number;
}

export class CodigoNombreOcupacionDto {
  @ApiProperty({ example: 'MOC' })
  codigo!: string;

  @ApiProperty({ example: 'Mocoa' })
  nombre!: string;
}

export class OcupacionSedeDto {
  @ApiProperty({ type: CodigoNombreOcupacionDto })
  sede!: CodigoNombreOcupacionDto;

  @ApiProperty({ type: CodigoNombreOcupacionDto, nullable: true })
  bloque!: CodigoNombreOcupacionDto | null;

  @ApiProperty({ example: '2026-11-02T05:00:00.000Z' })
  desde!: string;

  @ApiProperty({ example: '2026-11-09T05:00:00.000Z' })
  hasta!: string;

  @ApiProperty({ example: 1200 })
  horasOperacion!: number;

  @ApiProperty({ example: 480.5 })
  horasOcupadas!: number;

  @ApiProperty({ example: 40.04 })
  porcentajeOcupacion!: number;

  @ApiProperty({ type: [OcupacionEspacioSedeDto] })
  espacios!: OcupacionEspacioSedeDto[];
}
