import { ApiProperty } from '@nestjs/swagger';

export const ESTADOS_FRANJA_PUBLICA = ['RETENIDA', 'CONFIRMADA', 'BLOQUEO'] as const;
export type EstadoFranjaPublica = (typeof ESTADOS_FRANJA_PUBLICA)[number];

export class FranjaDisponibilidadDto {
  @ApiProperty({ example: '2026-11-03T13:00:00.000Z', description: 'Inicio de la ocupación (UTC).' })
  inicio!: string;

  @ApiProperty({ example: '2026-11-03T15:00:00.000Z', description: 'Fin de la ocupación (UTC).' })
  fin!: string;

  @ApiProperty({
    enum: ESTADOS_FRANJA_PUBLICA,
    example: 'CONFIRMADA',
    description: 'RETENIDA: solicitud en trámite. CONFIRMADA: reserva firme. BLOQUEO: clase o cierre.',
  })
  estado!: EstadoFranjaPublica;

  @ApiProperty({
    example: 'Ocupado',
    description: 'Texto visible al público: la etiqueta pública de la franja o "Ocupado". Nunca datos personales.',
  })
  etiqueta!: string;
}

export class HorarioOperacionDto {
  @ApiProperty({ example: 1, description: 'Día de la semana: 0 = domingo … 6 = sábado.' })
  diaSemana!: number;

  @ApiProperty({ example: '06:00', description: 'Hora de apertura (HH:mm, hora de Bogotá).' })
  abre!: string;

  @ApiProperty({ example: '22:00', description: 'Hora de cierre (HH:mm, hora de Bogotá).' })
  cierra!: string;
}

export class DisponibilidadDto {
  @ApiProperty({ format: 'uuid', example: '8a3b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b' })
  espacioId!: string;

  @ApiProperty({ example: '2026-11-02T00:00:00.000Z' })
  desde!: string;

  @ApiProperty({ example: '2026-11-09T00:00:00.000Z' })
  hasta!: string;

  @ApiProperty({ type: [FranjaDisponibilidadDto], description: 'Franjas ocupadas, ordenadas por inicio.' })
  franjas!: FranjaDisponibilidadDto[];

  @ApiProperty({
    type: [HorarioOperacionDto],
    description:
      'Horario de operación del espacio, ordenado por día de la semana (0 = domingo). ' +
      'Arreglo vacío: el espacio no tiene restricción de horario. Los días sin fila están cerrados.',
  })
  horarios!: HorarioOperacionDto[];

  @ApiProperty({
    example: '2026-11-10T05:00:00.000Z',
    description:
      'Primer instante (ISO 8601, UTC) en que puede empezar una franja según la anticipación mínima del tipo ' +
      'de espacio (días hábiles y festivos incluidos): el inicio del primer día local de Bogotá que la cumple.',
  })
  reservableDesde!: string;
}

export class BloqueoCreadoDto {
  @ApiProperty({ format: 'uuid', example: '5c1d8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b' })
  id!: string;

  @ApiProperty({ format: 'uuid', example: '8a3b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b' })
  espacioId!: string;

  @ApiProperty({ example: 'MANTENIMIENTO', description: 'Motivo del bloqueo.' })
  motivo!: string;

  @ApiProperty({ example: 8, description: 'Número de franjas generadas al expandir la recurrencia.' })
  franjasCreadas!: number;

  @ApiProperty({ example: '2026-11-03T13:00:00.000Z', description: 'Inicio de la primera franja (UTC).' })
  inicio!: string;

  @ApiProperty({ example: '2026-12-09T15:00:00.000Z', description: 'Fin de la última franja (UTC).' })
  fin!: string;
}

export class BloqueoResumenDto {
  @ApiProperty({ format: 'uuid', example: '5c1d8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b' })
  id!: string;

  @ApiProperty({ format: 'uuid', example: '8a3b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b' })
  espacioId!: string;

  @ApiProperty({ example: 'MANTENIMIENTO', description: 'Motivo del bloqueo.' })
  motivo!: string;

  @ApiProperty({ type: String, nullable: true })
  descripcion!: string | null;

  @ApiProperty({ example: '2026-11-03T13:00:00.000Z' })
  inicio!: string;

  @ApiProperty({ example: '2026-11-03T15:00:00.000Z' })
  fin!: string;

  @ApiProperty({ type: String, nullable: true })
  rrule!: string | null;

  @ApiProperty({ type: String, nullable: true })
  repetirHasta!: string | null;

  @ApiProperty({ example: 4 })
  franjasActivas!: number;
}


export class CodigoNombreResultadoDto {
  @ApiProperty({ example: 'B' })
  codigo!: string;

  @ApiProperty({ example: 'Bloque B' })
  nombre!: string;
}

export class AjusteAforoDto {
  @ApiProperty({ enum: ['ADECUADO', 'SOBRA_ESPACIO'] })
  nivel!: 'ADECUADO' | 'SOBRA_ESPACIO';

  @ApiProperty({ example: 0.67, description: 'Fracción de ocupación (asistentes / capacidad).' })
  ocupacion!: number;

  @ApiProperty({ example: 'Capacidad suficiente para 40 personas.' })
  mensaje!: string;
}

export class EspacioLibreDto {
  @ApiProperty({ format: 'uuid', example: '8a3b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b' })
  espacioId!: string;

  @ApiProperty({ example: 'B-101' })
  codigo!: string;

  @ApiProperty({ example: 'Aula B-101' })
  nombre!: string;

  @ApiProperty({ example: 1 })
  piso!: number;

  @ApiProperty({ example: 60 })
  capacidadPersonas!: number;

  @ApiProperty({ type: CodigoNombreResultadoDto })
  bloque!: CodigoNombreResultadoDto;

  @ApiProperty({ type: CodigoNombreResultadoDto })
  sede!: CodigoNombreResultadoDto;

  @ApiProperty({ type: AjusteAforoDto })
  aforo!: AjusteAforoDto;
}

export class ResultadoBusquedaDto {
  @ApiProperty({ example: '2026-11-03' })
  fecha!: string;

  @ApiProperty({ example: '08:00' })
  horaInicio!: string;

  @ApiProperty({ example: '12:00' })
  horaFin!: string;

  @ApiProperty({ example: 40 })
  asistentes!: number;

  @ApiProperty({ type: [EspacioLibreDto], description: 'Espacios libres, del mejor ajuste al peor.' })
  espacios!: EspacioLibreDto[];

  @ApiProperty({ example: 3 })
  total!: number;
}
