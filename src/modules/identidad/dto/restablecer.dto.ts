import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { MAX_CONTRASENA, MIN_CONTRASENA, largo, largoMinimo, noVacio, texto } from './validacion.js';

export class RestablecerDto {
  @ApiProperty({ description: 'Token de un solo uso recibido en el enlace de recuperación.', example: 'a1b2c3d4e5f6' })
  @IsString({ message: texto })
  @IsNotEmpty({ message: noVacio })
  @MaxLength(512, { message: largo(512) })
  token!: string;

  @ApiProperty({
    description: `Nueva contraseña, de ${MIN_CONTRASENA} a ${MAX_CONTRASENA} caracteres.`,
    example: 'Nueva-clave-2026',
    minLength: MIN_CONTRASENA,
    maxLength: MAX_CONTRASENA,
  })
  @IsString({ message: texto })
  @MinLength(MIN_CONTRASENA, { message: largoMinimo(MIN_CONTRASENA) })
  @MaxLength(MAX_CONTRASENA, { message: largo(MAX_CONTRASENA) })
  contrasenaNueva!: string;
}
