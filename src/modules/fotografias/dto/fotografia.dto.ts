import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const VARIANTES_FOTO = ['detalle', 'tarjeta', 'miniatura'] as const;
export type VarianteFoto = (typeof VARIANTES_FOTO)[number];

export class SubirFotoDto {
  @ApiProperty({
    example: 'Vista frontal del Auditorio Mayor con las sillas dispuestas en filas.',
    maxLength: 250,
    description: 'Texto alternativo obligatorio (RF-INV-04, accesibilidad).',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'textoAlternativo debe ser texto.' })
  @IsNotEmpty({ message: 'El texto alternativo es obligatorio.' })
  @MaxLength(250, { message: 'textoAlternativo no puede superar 250 caracteres.' })
  textoAlternativo!: string;

  @ApiPropertyOptional({ default: false, description: 'Si es la portada del espacio; reemplaza a la anterior.' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean({ message: 'esPortada debe ser verdadero o falso.' })
  esPortada?: boolean;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 999 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'orden debe ser un número entero.' })
  @Min(0, { message: 'orden no puede ser negativo.' })
  @Max(999, { message: 'orden no puede superar 999.' })
  orden?: number;
}

export class FotoDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: '/api/fotos/3f2b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b/detalle' })
  urlDetalle!: string;

  @ApiProperty({ example: '/api/fotos/3f2b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b/tarjeta' })
  urlTarjeta!: string;

  @ApiProperty({ example: '/api/fotos/3f2b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b/miniatura' })
  urlMiniatura!: string;

  @ApiProperty({ example: 'Vista frontal del Auditorio Mayor.' })
  textoAlternativo!: string;

  @ApiProperty({ example: true })
  esPortada!: boolean;

  @ApiProperty({ example: 0 })
  orden!: number;
}
