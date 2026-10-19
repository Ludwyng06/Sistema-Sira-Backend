import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { aBooleano } from './transformaciones.js';

const FORMATO_CODIGO = /^[A-Z0-9][A-Z0-9_-]{1,29}$/;

export class CrearDependenciaDto {
  @ApiProperty({ example: 'ING-SIS', description: 'Código único en mayúsculas, números, guion y guion bajo.' })
  @IsString({ message: 'codigo debe ser texto.' })
  @Matches(FORMATO_CODIGO, {
    message: 'codigo debe tener de 2 a 30 caracteres: mayúsculas, números, guion o guion bajo.',
  })
  codigo!: string;

  @ApiProperty({ example: 'Ingeniería de Sistemas', maxLength: 120 })
  @IsString({ message: 'nombre debe ser texto.' })
  @IsNotEmpty({ message: 'nombre es obligatorio.' })
  @MaxLength(120, { message: 'nombre no puede superar 120 caracteres.' })
  nombre!: string;

  @ApiPropertyOptional({ example: 'CC-1042', maxLength: 40 })
  @IsOptional()
  @IsString({ message: 'centroCosto debe ser texto.' })
  @MaxLength(40, { message: 'centroCosto no puede superar 40 caracteres.' })
  centroCosto?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Usuario activo que es jefe de la dependencia.' })
  @IsOptional()
  @IsUUID('all', { message: 'jefeId debe ser un identificador válido.' })
  jefeId?: string;
}

export class ActualizarDependenciaDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString({ message: 'nombre debe ser texto.' })
  @IsNotEmpty({ message: 'nombre no puede estar vacío.' })
  @MaxLength(120, { message: 'nombre no puede superar 120 caracteres.' })
  nombre?: string;

  @ApiPropertyOptional({ maxLength: 40, nullable: true, description: 'null quita el centro de costo.' })
  @IsOptional()
  @IsString({ message: 'centroCosto debe ser texto.' })
  @MaxLength(40, { message: 'centroCosto no puede superar 40 caracteres.' })
  centroCosto?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'null quita al jefe.' })
  @IsOptional()
  @IsUUID('all', { message: 'jefeId debe ser un identificador válido.' })
  jefeId?: string | null;
}

export class FiltrosDependenciasDto {
  @ApiPropertyOptional({ description: 'Solo activas (true) o solo archivadas (false).' })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean({ message: 'activa debe ser verdadero o falso.' })
  activa?: boolean;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pagina debe ser un número entero.' })
  @Min(1, { message: 'pagina debe ser al menos 1.' })
  pagina: number = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'porPagina debe ser un número entero.' })
  @Min(1, { message: 'porPagina debe ser al menos 1.' })
  @Max(100, { message: 'porPagina no puede ser mayor que 100.' })
  porPagina: number = 50;
}

export class JefeDependenciaDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'jefe@itp.edu.co' })
  correo!: string;
}

export class DependenciaAdminDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ING-SIS' })
  codigo!: string;

  @ApiProperty({ example: 'Ingeniería de Sistemas' })
  nombre!: string;

  @ApiProperty({ type: String, nullable: true })
  centroCosto!: string | null;

  @ApiProperty({ type: JefeDependenciaDto, nullable: true })
  jefe!: JefeDependenciaDto | null;

  @ApiProperty({ example: true })
  activa!: boolean;

  @ApiProperty({ example: '2026-10-01T15:00:00.000Z' })
  creadoEn!: string;
}

export class PaginaDependenciasDto {
  @ApiProperty({ type: [DependenciaAdminDto] })
  datos!: DependenciaAdminDto[];

  @ApiProperty({ example: 8 })
  total!: number;

  @ApiProperty({ example: 1 })
  pagina!: number;

  @ApiProperty({ example: 50 })
  porPagina!: number;
}
