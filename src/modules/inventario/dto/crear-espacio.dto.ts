import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ValidationArguments,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const texto = (a: ValidationArguments) => `${a.property} debe ser un texto.`;
const noVacio = (a: ValidationArguments) => `${a.property} es obligatorio.`;
const entero = (a: ValidationArguments) => `${a.property} debe ser un número entero.`;
const minimo = (min: number) => (a: ValidationArguments) => `${a.property} debe ser al menos ${min}.`;
const decimal = (a: ValidationArguments) => `${a.property} debe ser un número con máximo 2 decimales.`;
const booleano = (a: ValidationArguments) => `${a.property} debe ser verdadero o falso.`;
const largo = (max: number) => (a: ValidationArguments) => `${a.property} no puede superar ${max} caracteres.`;

export class CrearEspacioDto {
  @ApiProperty({ description: 'Código de la sede.', example: 'MOC' })
  @IsString({ message: texto })
  @IsNotEmpty({ message: noVacio })
  sede!: string;

  @ApiProperty({ description: 'Código del bloque dentro de la sede.', example: 'A' })
  @IsString({ message: texto })
  @IsNotEmpty({ message: noVacio })
  bloque!: string;

  @ApiProperty({ description: 'Código del tipo de espacio.', example: 'AULA' })
  @IsString({ message: texto })
  @IsNotEmpty({ message: noVacio })
  tipo!: string;

  @ApiProperty({ description: 'Numeración del plano.', example: 'A-401' })
  @Matches(/^[A-Z0-9]+(-[A-Z0-9]+)*$/, {
    message: 'El código solo admite mayúsculas, números y guiones (ej. A-401).',
  })
  codigo!: string;

  @ApiProperty({ example: 'Aula 401' })
  @IsString({ message: texto })
  @IsNotEmpty({ message: noVacio })
  @MaxLength(120, { message: largo(120) })
  nombre!: string;

  @ApiProperty({ example: 4, minimum: 1 })
  @Type(() => Number)
  @IsInt({ message: entero })
  @Min(1, { message: minimo(1) })
  piso!: number;

  @ApiProperty({ example: 30, minimum: 1 })
  @Type(() => Number)
  @IsInt({ message: entero })
  @Min(1, { message: minimo(1) })
  capacidadPersonas!: number;

  @ApiPropertyOptional({ example: 48.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: decimal })
  @Min(0, { message: minimo(0) })
  areaM2?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: texto })
  @MaxLength(1000, { message: largo(1000) })
  descripcion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: texto })
  @MaxLength(1000, { message: largo(1000) })
  condicionesUso?: string;

  @ApiPropertyOptional({ description: 'Código de la dependencia dueña.', example: 'BIBLIOTECA' })
  @IsOptional()
  @IsString({ message: texto })
  dependencia?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean({ message: booleano })
  requiereAval?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean({ message: booleano })
  esReservable?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: entero })
  @Min(0, { message: minimo(0) })
  minutosMontaje?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: entero })
  @Min(0, { message: minimo(0) })
  minutosDesmontaje?: number;

  @ApiPropertyOptional({ description: 'Depósito fijo en pesos enteros.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: entero })
  @Min(0, { message: minimo(0) })
  depositoValorFijo?: number;

  @ApiPropertyOptional({ description: 'Depósito como porcentaje (0 a 100).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: decimal })
  @Min(0, { message: minimo(0) })
  @Max(100, { message: (a: ValidationArguments) => `${a.property} no puede ser mayor que 100.` })
  depositoPorcentaje?: number;
}
