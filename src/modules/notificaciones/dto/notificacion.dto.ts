import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class FiltrosNotificacionesDto {
  @ApiPropertyOptional({ default: false, description: 'Si es verdadero, solo las no leídas.' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean({ message: 'soloNoLeidas debe ser verdadero o falso.' })
  soloNoLeidas: boolean = false;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pagina debe ser un número entero.' })
  @Min(1, { message: 'pagina debe ser al menos 1.' })
  @Max(100_000, { message: 'pagina no puede superar 100000.' })
  pagina: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'porPagina debe ser un número entero.' })
  @Min(1, { message: 'porPagina debe ser al menos 1.' })
  @Max(100, { message: 'porPagina no puede ser mayor que 100.' })
  porPagina: number = 20;
}

export class NotificacionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Tu solicitud SOL-2026-0001 fue aprobada' })
  titulo!: string;

  @ApiProperty({ example: 'Ya puedes generar la orden de pago desde el detalle de la solicitud.' })
  cuerpo!: string;

  @ApiProperty({ type: String, nullable: true, example: '/solicitudes/6e1d8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b' })
  enlace!: string | null;

  @ApiProperty({ example: false })
  leida!: boolean;

  @ApiProperty({ example: '2026-10-22T15:00:00.000Z' })
  creadaEn!: string;
}

export class PaginaNotificacionesDto {
  @ApiProperty({ type: [NotificacionDto] })
  datos!: NotificacionDto[];

  @ApiProperty({ example: 25 })
  total!: number;

  @ApiProperty({ example: 3, description: 'Notificaciones sin leer del usuario.' })
  noLeidas!: number;

  @ApiProperty({ example: 1 })
  pagina!: number;

  @ApiProperty({ example: 20 })
  porPagina!: number;
}
