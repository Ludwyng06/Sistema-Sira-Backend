import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Consulta con solo el número de asistentes (detalle de bloque). */
export class ConsultaAsistentesDto {
  @ApiPropertyOptional({ description: 'Número de asistentes: oculta lo que no cabe y ordena por ajuste.', example: 40 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'asistentes debe ser un número entero.' })
  @Min(1, { message: 'asistentes debe ser al menos 1.' })
  asistentes?: number;
}

export class FiltrosEspaciosDto extends ConsultaAsistentesDto {
  @ApiPropertyOptional({ description: 'Código de la sede.', example: 'MOC' })
  @IsOptional()
  @IsString()
  sede?: string;

  @ApiPropertyOptional({ description: 'Código del bloque (requiere sede para ser único).', example: 'A' })
  @IsOptional()
  @IsString()
  bloque?: string;

  @ApiPropertyOptional({ description: 'Código del tipo de espacio.', example: 'AULA' })
  @IsOptional()
  @IsString()
  tipo?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pagina debe ser un número entero.' })
  @Min(1, { message: 'pagina debe ser al menos 1.' })
  pagina: number = 1;

  @ApiPropertyOptional({ default: 24, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'porPagina debe ser un número entero.' })
  @Min(1, { message: 'porPagina debe ser al menos 1.' })
  @Max(100, { message: 'porPagina no puede ser mayor que 100.' })
  porPagina: number = 24;
}
