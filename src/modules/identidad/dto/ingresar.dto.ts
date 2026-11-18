import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { CorreoDto, MAX_CONTRASENA, largo, noVacio, texto } from './validacion.js';

export class IngresarDto extends CorreoDto {
  @ApiProperty({ description: 'Contraseña de la cuenta.', example: 'Clave-segura-2026' })
  @IsString({ message: texto })
  @IsNotEmpty({ message: noVacio })
  @MaxLength(MAX_CONTRASENA, { message: largo(MAX_CONTRASENA) })
  contrasena!: string;
}
