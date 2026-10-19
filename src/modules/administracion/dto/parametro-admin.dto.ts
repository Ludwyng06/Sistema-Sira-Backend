import { ApiProperty } from '@nestjs/swagger';
import { IsDefined } from 'class-validator';

export class ActualizarParametroDto {
  @ApiProperty({
    example: 72,
    description:
      'Nuevo valor. Debe conservar la forma del actual: número, texto, lista de textos u objeto con las ' +
      'mismas claves.',
  })
  @IsDefined({ message: 'valor es obligatorio.' })
  valor!: unknown;
}

export class ParametroDto {
  @ApiProperty({ example: 'horas_plazo_revision' })
  clave!: string;

  @ApiProperty({ example: 72, description: 'Valor JSON del parámetro.' })
  valor!: unknown;

  @ApiProperty({ type: String, nullable: true, example: 'Plazo de revisión de una solicitud enviada (RN-02a).' })
  descripcion!: string | null;

  @ApiProperty({ example: '2026-10-01T15:00:00.000Z' })
  actualizadoEn!: string;
}
