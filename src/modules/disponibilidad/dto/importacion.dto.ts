import { ApiProperty } from '@nestjs/swagger';

export class SubirHorarioDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description:
      'CSV con las columnas espacio, dia, horaInicio, horaFin, desde, hasta y descripcion (opcional), ' +
      'separado por coma o punto y coma. Máximo 2 MB y 2000 filas (campo multipart «archivo»).',
  })
  archivo!: unknown;
}

export class ErrorFilaDto {
  @ApiProperty({ example: 4, description: 'Línea del archivo (el encabezado es la 1).' })
  fila!: number;

  @ApiProperty({ example: 'El espacio «Z-999» no existe.' })
  mensaje!: string;
}

export class ConflictoImportacionDto {
  @ApiProperty({ example: 3 })
  fila!: number;

  @ApiProperty({ example: 'A-101' })
  espacio!: string;

  @ApiProperty({ example: '2026-11-03T13:00:00.000Z' })
  inicio!: string;

  @ApiProperty({ example: '2026-11-03T15:00:00.000Z' })
  fin!: string;

  @ApiProperty({
    example: 'Choca con una reserva confirmada.',
    description: 'Qué ocupa ya ese horario. Hay que reprogramar la reserva o la clase (RN-03).',
  })
  motivo!: string;
}

export class ReporteImportacionDto {
  @ApiProperty({ example: 40, description: 'Filas de datos leídas.' })
  filasLeidas!: number;

  @ApiProperty({ example: 38, description: 'Filas que generaron al menos un bloqueo.' })
  bloqueosCreados!: number;

  @ApiProperty({ example: 590, description: 'Franjas de clase creadas.' })
  franjasCreadas!: number;

  @ApiProperty({ type: [ConflictoImportacionDto], description: 'Ocurrencias omitidas por chocar con otra ocupación.' })
  conflictos!: ConflictoImportacionDto[];

  @ApiProperty({ type: [ErrorFilaDto], description: 'Filas con datos inválidos, que no se importaron.' })
  errores!: ErrorFilaDto[];
}
