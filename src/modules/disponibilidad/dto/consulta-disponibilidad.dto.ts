import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsUUID } from 'class-validator';

export class ConsultaDisponibilidadDto {
  @ApiProperty({
    format: 'uuid',
    example: '8a3b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b',
    description: 'Identificador del espacio cuya ocupación se consulta.',
  })
  @IsUUID('all', { message: 'espacioId debe ser un identificador válido.' })
  espacioId!: string;

  @ApiProperty({
    example: '2026-11-02T00:00:00.000Z',
    description: 'Inicio del rango consultado, en ISO 8601 (UTC).',
  })
  @IsISO8601({ strict: true }, { message: 'desde debe ser una fecha ISO 8601 válida.' })
  desde!: string;

  @ApiProperty({
    example: '2026-11-09T00:00:00.000Z',
    description: 'Fin del rango consultado, en ISO 8601 (UTC). Debe ser posterior a desde.',
  })
  @IsISO8601({ strict: true }, { message: 'hasta debe ser una fecha ISO 8601 válida.' })
  hasta!: string;
}
