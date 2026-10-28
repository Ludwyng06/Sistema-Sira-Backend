import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class FiltrosAuditoriaDto {
  @ApiPropertyOptional({ example: 'Solicitud', description: 'Tipo de entidad afectada.' })
  @IsOptional()
  @IsString({ message: 'entidad debe ser texto.' })
  @MaxLength(60, { message: 'entidad no puede superar 60 caracteres.' })
  entidad?: string;

  @ApiPropertyOptional({ description: 'Identificador de la entidad afectada.' })
  @IsOptional()
  @IsString({ message: 'entidadId debe ser texto.' })
  @MaxLength(60, { message: 'entidadId no puede superar 60 caracteres.' })
  entidadId?: string;

  @ApiPropertyOptional({ example: 'SOLICITUD_ENVIADA' })
  @IsOptional()
  @IsString({ message: 'accion debe ser texto.' })
  @MaxLength(80, { message: 'accion no puede superar 80 caracteres.' })
  accion?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Usuario que ejecutó la acción.' })
  @IsOptional()
  @IsUUID('all', { message: 'usuarioId debe ser un identificador válido.' })
  usuarioId?: string;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'desde debe ser una fecha ISO 8601 válida.' })
  desde?: string;

  @ApiPropertyOptional({ example: '2026-10-31T23:59:59.000Z' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'hasta debe ser una fecha ISO 8601 válida.' })
  hasta?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pagina debe ser un número entero.' })
  @Min(1, { message: 'pagina debe ser al menos 1.' })
  @Max(100_000, { message: 'pagina no puede superar 100000.' })
  pagina: number = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'porPagina debe ser un número entero.' })
  @Min(1, { message: 'porPagina debe ser al menos 1.' })
  @Max(200, { message: 'porPagina no puede ser mayor que 200.' })
  porPagina: number = 50;
}

export class RegistroAuditoriaDto {
  @ApiProperty({ example: '1204', description: 'Identificador secuencial de la bitácora.' })
  id!: string;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  usuarioId!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'ana@itp.edu.co' })
  usuarioCorreo!: string | null;

  @ApiProperty({ example: 'SOLICITUD_ENVIADA' })
  accion!: string;

  @ApiProperty({ example: 'Solicitud' })
  entidad!: string;

  @ApiProperty({ type: String, nullable: true })
  entidadId!: string | null;

  @ApiProperty({ nullable: true, description: 'Estado anterior de la entidad, si se registró.' })
  datosAntes!: unknown;

  @ApiProperty({ nullable: true, description: 'Estado posterior o detalle de la acción.' })
  datosDespues!: unknown;

  @ApiProperty({ type: String, nullable: true, example: '10.0.0.7' })
  ip!: string | null;

  @ApiProperty({ type: String, nullable: true })
  userAgent!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Identificador de la petición que originó la acción.' })
  correlacionId!: string | null;

  @ApiProperty({ example: '2026-10-22T15:00:00.000Z' })
  ocurrioEn!: string;
}

export class PaginaAuditoriaDto {
  @ApiProperty({ type: [RegistroAuditoriaDto] })
  datos!: RegistroAuditoriaDto[];

  @ApiProperty({ example: 120 })
  total!: number;

  @ApiProperty({ example: 1 })
  pagina!: number;

  @ApiProperty({ example: 50 })
  porPagina!: number;
}
