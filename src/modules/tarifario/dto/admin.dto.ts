import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TipoRecargo, TipoSolicitante, UnidadCobroTarifa } from '../../../generated/prisma/enums.js';

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const MENSAJE_FECHA = 'debe tener el formato AAAA-MM-DD.';

// ---------------------------------------------------------------- Tarifas

/** Tope de la columna INT4 de PostgreSQL, con margen. */
export const MAXIMO_VALOR_PESOS = 2_000_000_000;

export class CrearTarifaDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Espacio al que aplica. Exactamente uno de espacioId o servicioId.',
  })
  @IsOptional()
  @IsUUID('all', { message: 'espacioId debe ser un identificador válido.' })
  espacioId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Servicio al que aplica. Exactamente uno de espacioId o servicioId.',
  })
  @IsOptional()
  @IsUUID('all', { message: 'servicioId debe ser un identificador válido.' })
  servicioId?: string;

  @ApiProperty({ enum: TipoSolicitante, example: TipoSolicitante.EMPRESA })
  @IsEnum(TipoSolicitante, { message: 'tipoSolicitante no es válido.' })
  tipoSolicitante!: TipoSolicitante;

  @ApiPropertyOptional({
    enum: UnidadCobroTarifa,
    example: UnidadCobroTarifa.HORA,
    description: 'Obligatoria para espacios. En servicios la unidad la define el servicio y no se envía.',
  })
  @IsOptional()
  @IsEnum(UnidadCobroTarifa, { message: 'unidad no es válida.' })
  unidad?: UnidadCobroTarifa;

  @ApiPropertyOptional({ example: 80000, minimum: 0, description: 'Valor en pesos enteros. Excluye a valorEnSmmlv.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'valor debe ser un número entero de pesos.' })
  @Min(0, { message: 'valor no puede ser negativo.' })
  @Max(MAXIMO_VALOR_PESOS, { message: 'valor no puede superar 2000000000 pesos.' })
  valor?: number;

  @ApiPropertyOptional({
    example: 0.05,
    description: 'Fracción de SMMLV (hasta 4 decimales). Excluye a valor; el valor en pesos se resuelve con el año.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'valorEnSmmlv debe ser un número con máximo 4 decimales.' })
  @Min(0, { message: 'valorEnSmmlv no puede ser negativo.' })
  @Max(1000, { message: 'valorEnSmmlv no puede superar 1000.' })
  valorEnSmmlv?: number;

  @ApiProperty({ example: '2026-01-01', description: 'Primer día de vigencia (AAAA-MM-DD).' })
  @Matches(FORMATO_FECHA, { message: `vigenciaDesde ${MENSAJE_FECHA}` })
  vigenciaDesde!: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Último día de vigencia (AAAA-MM-DD); vacío = indefinida.',
  })
  @IsOptional()
  @Matches(FORMATO_FECHA, { message: `vigenciaHasta ${MENSAJE_FECHA}` })
  vigenciaHasta?: string;

  @ApiPropertyOptional({ example: 'Acuerdo 012 de 2026', maxLength: 200 })
  @IsOptional()
  @IsString({ message: 'acuerdoSoporte debe ser texto.' })
  @MaxLength(200, { message: 'acuerdoSoporte no puede superar 200 caracteres.' })
  acuerdoSoporte?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean({ message: 'ivaAplica debe ser verdadero o falso.' })
  ivaAplica?: boolean;

  @ApiPropertyOptional({ example: 19, minimum: 0, maximum: 100, description: 'Solo si ivaAplica es verdadero.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'porcentajeIva debe tener máximo 2 decimales.' })
  @Min(0, { message: 'porcentajeIva no puede ser negativo.' })
  @Max(100, { message: 'porcentajeIva no puede superar 100.' })
  porcentajeIva?: number;
}

/** RN-05: el valor de una tarifa no se edita; para cambiarlo se crea una nueva vigencia. */
export class ActualizarTarifaDto {
  @ApiPropertyOptional({ example: '2026-12-31', description: 'Cierra la vigencia en esa fecha (AAAA-MM-DD).' })
  @IsOptional()
  @Matches(FORMATO_FECHA, { message: `vigenciaHasta ${MENSAJE_FECHA}` })
  vigenciaHasta?: string;

  @ApiPropertyOptional({ example: 'Acuerdo 012 de 2026', maxLength: 200 })
  @IsOptional()
  @IsString({ message: 'acuerdoSoporte debe ser texto.' })
  @MaxLength(200, { message: 'acuerdoSoporte no puede superar 200 caracteres.' })
  acuerdoSoporte?: string;
}

export class FiltrosTarifasDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'espacioId debe ser un identificador válido.' })
  espacioId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'servicioId debe ser un identificador válido.' })
  servicioId?: string;

  @ApiPropertyOptional({ enum: TipoSolicitante })
  @IsOptional()
  @IsEnum(TipoSolicitante, { message: 'tipoSolicitante no es válido.' })
  tipoSolicitante?: TipoSolicitante;

  @ApiPropertyOptional({ default: false, description: 'Si es verdadero, solo las vigentes hoy.' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean({ message: 'vigentes debe ser verdadero o falso.' })
  vigentes: boolean = false;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pagina debe ser un número entero.' })
  @Min(1, { message: 'pagina debe ser al menos 1.' })
  @Max(100_000, { message: 'pagina no puede superar 100000.' })
  pagina: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'porPagina debe ser un número entero.' })
  @Min(1, { message: 'porPagina debe ser al menos 1.' })
  @Max(100, { message: 'porPagina no puede ser mayor que 100.' })
  porPagina: number = 20;
}

export class TarifaDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  espacioId!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  servicioId!: string | null;

  @ApiProperty({ enum: TipoSolicitante })
  tipoSolicitante!: TipoSolicitante;

  @ApiProperty({ enum: UnidadCobroTarifa, nullable: true })
  unidad!: UnidadCobroTarifa | null;

  @ApiProperty({ example: 80000, description: 'Valor en pesos enteros.' })
  valor!: number;

  @ApiProperty({ type: Number, nullable: true, example: 0.05 })
  valorEnSmmlv!: number | null;

  @ApiProperty({ example: '2026-01-01' })
  vigenciaDesde!: string;

  @ApiProperty({ type: String, nullable: true, example: '2026-12-31' })
  vigenciaHasta!: string | null;

  @ApiProperty({ type: String, nullable: true })
  acuerdoSoporte!: string | null;

  @ApiProperty({ example: false })
  ivaAplica!: boolean;

  @ApiProperty({ example: 0 })
  porcentajeIva!: number;

  @ApiProperty({ example: '2026-10-22T15:00:00.000Z' })
  creadoEn!: string;
}

export class PaginaTarifasDto {
  @ApiProperty({ type: [TarifaDto] })
  datos!: TarifaDto[];

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ example: 1 })
  pagina!: number;

  @ApiProperty({ example: 20 })
  porPagina!: number;
}

// ---------------------------------------------------------------- Recargos

export class ActualizarRecargoDto {
  @ApiPropertyOptional({ example: 20, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'porcentaje debe tener máximo 2 decimales.' })
  @Min(0, { message: 'porcentaje no puede ser negativo.' })
  @Max(100, { message: 'porcentaje no puede superar 100.' })
  porcentaje?: number;

  @ApiPropertyOptional({ example: '18:00', description: 'Solo para NOCTURNO: hora desde la que aplica (HH:MM).' })
  @IsOptional()
  @Matches(FORMATO_HORA, { message: 'desdeHora debe tener el formato HH:MM.' })
  desdeHora?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'activo debe ser verdadero o falso.' })
  activo?: boolean;
}

export class RecargoDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: TipoRecargo, example: TipoRecargo.NOCTURNO })
  tipo!: TipoRecargo;

  @ApiProperty({ example: 20 })
  porcentaje!: number;

  @ApiProperty({ type: String, nullable: true, example: '18:00' })
  desdeHora!: string | null;

  @ApiProperty({ example: true })
  activo!: boolean;
}

// ---------------------------------------------------------------- Festivos

export class CrearFestivoDto {
  @ApiProperty({ example: '2026-12-08', description: 'Fecha del festivo (AAAA-MM-DD).' })
  @Matches(FORMATO_FECHA, { message: `fecha ${MENSAJE_FECHA}` })
  fecha!: string;

  @ApiProperty({ example: 'Inmaculada Concepción', maxLength: 100 })
  @IsString({ message: 'nombre debe ser texto.' })
  @IsNotEmpty({ message: 'Indica el nombre del festivo.' })
  @MaxLength(100, { message: 'nombre no puede superar 100 caracteres.' })
  nombre!: string;
}

export class FiltrosFestivosDto {
  @ApiPropertyOptional({ example: 2026, description: 'Año a consultar. Por defecto, el año en curso.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'anio debe ser un número entero.' })
  @Min(2000, { message: 'anio debe ser 2000 o posterior.' })
  @Max(2100, { message: 'anio no puede superar 2100.' })
  anio?: number;
}

export class FestivoDto {
  @ApiProperty({ example: '2026-12-08', description: 'Igual a la fecha; es la clave del festivo.' })
  id!: string;

  @ApiProperty({ example: '2026-12-08' })
  fecha!: string;

  @ApiProperty({ example: 'Inmaculada Concepción' })
  nombre!: string;
}
