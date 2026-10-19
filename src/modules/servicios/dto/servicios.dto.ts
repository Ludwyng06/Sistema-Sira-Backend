import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { CategoriaServicio, UnidadCobroServicio } from '../../../generated/prisma/enums.js';

export class FiltrosServiciosDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Tipo de espacio: lista solo los servicios permitidos en él (o sin restricción de tipo).',
  })
  @IsOptional()
  @IsUUID('all', { message: 'tipoEspacioId debe ser un identificador válido.' })
  tipoEspacioId?: string;
}

export class ServicioDto {
  @ApiProperty({ format: 'uuid', example: '4d1b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b' })
  id!: string;

  @ApiProperty({ example: 'Sonido profesional' })
  nombre!: string;

  @ApiProperty({ enum: CategoriaServicio, example: CategoriaServicio.TECNICO })
  categoria!: CategoriaServicio;

  @ApiProperty({ type: String, nullable: true, example: 'Consola, parlantes y operador.' })
  descripcion!: string | null;

  @ApiProperty({ enum: UnidadCobroServicio, example: UnidadCobroServicio.EVENTO })
  unidadCobro!: UnidadCobroServicio;

  @ApiProperty({ example: true, description: 'Si el proveedor debe confirmar la disponibilidad.' })
  requiereConfirmacion!: boolean;

  @ApiProperty({ example: 3, description: 'Días mínimos de anticipación para solicitarlo.' })
  anticipacionMinimaDias!: number;

  @ApiProperty({ type: Number, nullable: true, example: 2, description: 'Cantidad máxima por solicitud.' })
  cantidadMaxima!: number | null;
}
