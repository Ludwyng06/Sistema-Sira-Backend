import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { EstadoFisico, EstadoSolicitud, TipoActa } from '../../../generated/prisma/enums.js';

export const TRATAMIENTOS_NOVEDAD = ['DESCONTAR_DEPOSITO', 'COBRO_ADICIONAL', 'SIN_COBRO'] as const;
export type TratamientoNovedad = (typeof TRATAMIENTOS_NOVEDAD)[number];

export class ItemChecklistEntradaDto {
  @ApiProperty({ format: 'uuid', description: 'Elemento del espacio que se verifica.' })
  @IsUUID('all', { message: 'elementoId debe ser un identificador válido.' })
  elementoId!: string;

  @ApiProperty({ example: 1, minimum: 0, description: 'Cantidad que se encontró al verificar.' })
  @Type(() => Number)
  @IsInt({ message: 'cantidadEncontrada debe ser un número entero.' })
  @Min(0, { message: 'cantidadEncontrada no puede ser negativa.' })
  @Max(100_000, { message: 'cantidadEncontrada no puede superar 100000.' })
  cantidadEncontrada!: number;

  @ApiProperty({ enum: EstadoFisico, example: EstadoFisico.BUENO })
  @IsEnum(EstadoFisico, { message: 'estadoFisico no es válido.' })
  estadoFisico!: EstadoFisico;
}

export class NovedadEntradaDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Elemento afectado, si aplica.' })
  @IsOptional()
  @IsUUID('all', { message: 'elementoId debe ser un identificador válido.' })
  elementoId?: string;

  @ApiProperty({ example: 'El videobeam quedó con el lente rayado.', maxLength: 500 })
  @IsString({ message: 'descripcion debe ser texto.' })
  @IsNotEmpty({ message: 'Describe la novedad.' })
  @MaxLength(500, { message: 'descripcion no puede superar 500 caracteres.' })
  descripcion!: string;

  @ApiProperty({ example: 150000, minimum: 0, description: 'Valor del daño en pesos enteros.' })
  @Type(() => Number)
  @IsInt({ message: 'valorDano debe ser un número entero.' })
  @Min(0, { message: 'valorDano no puede ser negativo.' })
  @Max(2_000_000_000, { message: 'valorDano no puede superar 2000000000 pesos.' })
  valorDano!: number;

  @ApiProperty({ enum: TRATAMIENTOS_NOVEDAD, example: 'DESCONTAR_DEPOSITO' })
  @IsIn(TRATAMIENTOS_NOVEDAD, { message: 'tratamiento no es válido.' })
  tratamiento!: TratamientoNovedad;
}

export class CrearActaDto {
  @ApiProperty({ format: 'uuid', example: '6e1d8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b' })
  @IsUUID('all', { message: 'solicitudId debe ser un identificador válido.' })
  solicitudId!: string;

  @ApiProperty({
    enum: TipoActa,
    example: TipoActa.ENTREGA,
    description: 'ENTREGA: CONFIRMADA pasa a EN_USO. DEVOLUCION: EN_USO pasa a FINALIZADA.',
  })
  @IsEnum(TipoActa, { message: 'tipo no es válido.' })
  tipo!: TipoActa;

  @ApiProperty({
    type: [ItemChecklistEntradaDto],
    description: 'Resultado de la verificación de cada elemento de los espacios de la solicitud.',
  })
  @IsArray({ message: 'checklist debe ser una lista.' })
  @ArrayMaxSize(200, { message: 'checklist no puede tener más de 200 elementos.' })
  @ValidateNested({ each: true })
  @Type(() => ItemChecklistEntradaDto)
  checklist!: ItemChecklistEntradaDto[];

  @ApiPropertyOptional({ example: 'Todo en orden.', maxLength: 1000 })
  @IsOptional()
  @IsString({ message: 'observaciones debe ser texto.' })
  @MaxLength(1000, { message: 'observaciones no puede superar 1000 caracteres.' })
  observaciones?: string;

  @ApiPropertyOptional({ type: [NovedadEntradaDto] })
  @IsOptional()
  @IsArray({ message: 'novedades debe ser una lista.' })
  @ArrayMaxSize(50, { message: 'novedades no puede tener más de 50 elementos.' })
  @ValidateNested({ each: true })
  @Type(() => NovedadEntradaDto)
  novedades?: NovedadEntradaDto[];
}

export class ItemChecklistDto {
  @ApiProperty({ format: 'uuid' })
  elementoId!: string;

  @ApiProperty({ example: 'Videobeam' })
  nombre!: string;

  @ApiProperty({ example: 1 })
  cantidadEsperada!: number;

  @ApiProperty({ example: 1 })
  cantidadEncontrada!: number;

  @ApiProperty({ enum: EstadoFisico })
  estadoFisico!: EstadoFisico;

  @ApiProperty({ example: true, description: 'Cantidad completa y en estado físico no MALO.' })
  ok!: boolean;
}

export class NovedadDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  elementoId!: string | null;

  @ApiProperty({ example: 'El videobeam quedó con el lente rayado.' })
  descripcion!: string;

  @ApiProperty({ example: 150000 })
  valorDano!: number;

  @ApiProperty({ enum: TRATAMIENTOS_NOVEDAD })
  tratamiento!: string;
}

export class ActaDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ACT-2026-0001' })
  consecutivo!: string;

  @ApiProperty({ format: 'uuid' })
  solicitudId!: string;

  @ApiProperty({ enum: TipoActa })
  tipo!: TipoActa;

  @ApiProperty({ enum: EstadoSolicitud, description: 'Estado de la solicitud tras el acta.' })
  estadoSolicitud!: EstadoSolicitud;

  @ApiProperty({ type: [ItemChecklistDto] })
  checklist!: ItemChecklistDto[];

  @ApiProperty({ type: String, nullable: true })
  observaciones!: string | null;

  @ApiProperty({ type: [NovedadDto] })
  novedades!: NovedadDto[];

  @ApiProperty({ example: '2026-11-03T13:00:00.000Z' })
  generadaEn!: string;
}
