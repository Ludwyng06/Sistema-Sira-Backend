import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { TipoDocumentoAdjunto } from '../../../generated/prisma/enums.js';

export class SubirDocumentoDto {
  @ApiProperty({
    enum: TipoDocumentoAdjunto,
    example: TipoDocumentoAdjunto.POLIZA,
    description: 'Tipo de documento que se adjunta.',
  })
  @IsEnum(TipoDocumentoAdjunto, { message: 'tipo no es válido.' })
  tipo!: TipoDocumentoAdjunto;
}

export class DocumentoDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: TipoDocumentoAdjunto, example: TipoDocumentoAdjunto.POLIZA })
  tipo!: TipoDocumentoAdjunto;

  @ApiProperty({ example: 'poliza-responsabilidad-civil.pdf' })
  nombre!: string;

  @ApiProperty({ example: 184320, description: 'Tamaño en bytes.' })
  tamanoBytes!: number;

  @ApiProperty({ example: '2026-10-21T15:00:00.000Z' })
  creadoEn!: string;
}
