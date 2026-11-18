import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RespuestaErrorDto {
  @ApiProperty({ example: 'DATOS_INVALIDOS' })
  codigo!: string;

  @ApiProperty({ description: 'Mensaje escrito para el usuario final.' })
  mensaje!: string;

  @ApiPropertyOptional({ type: Object, additionalProperties: true })
  detalles?: Record<string, unknown>;

  @ApiProperty({ example: 'b3e1f3c0-7a42-4e1b-a2f8-8e75db2a1f90' })
  correlacionId!: string;
}
