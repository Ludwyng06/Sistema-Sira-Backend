import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, ValidationArguments } from 'class-validator';

export const texto = (a: ValidationArguments) => `${a.property} debe ser un texto.`;
export const noVacio = (a: ValidationArguments) => `${a.property} es obligatorio.`;
export const largo = (max: number) => (a: ValidationArguments) =>
  `${a.property} no puede superar ${max} caracteres.`;
export const largoMinimo = (min: number) => (a: ValidationArguments) =>
  `${a.property} debe tener al menos ${min} caracteres.`;
export const correoInvalido = (a: ValidationArguments) =>
  `${a.property} debe ser un correo electrónico válido.`;

export const MIN_CONTRASENA = 10;
export const MAX_CONTRASENA = 128;

/** Recorta los espacios de los extremos; deja intactos los valores que no son texto. */
export const recortar = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const normalizarCorreo = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Correo válido de máximo 254 caracteres, normalizado a minúsculas y sin espacios. */
export class CorreoDto {
  @ApiProperty({ description: 'Correo electrónico de la cuenta.', example: 'ana.perez@ejemplo.com' })
  @Transform(normalizarCorreo)
  @IsString({ message: texto })
  @IsEmail({}, { message: correoInvalido })
  @MaxLength(254, { message: largo(254) })
  correo!: string;
}
