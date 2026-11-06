import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { CorreoDto } from './validacion.js';

export class VerificarCorreoDto extends CorreoDto {
  @ApiProperty({ description: 'Código de 6 dígitos enviado al correo.', example: '482913' })
  @Matches(/^\d{6}$/, { message: 'El código debe tener exactamente 6 dígitos.' })
  codigo!: string;
}
