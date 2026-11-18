import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Rol } from '../../../generated/prisma/enums.js';
import { aBooleano } from './transformaciones.js';

export class FiltrosUsuariosDto {
  @ApiPropertyOptional({ enum: Rol, description: 'Solo usuarios que tienen este rol.' })
  @IsOptional()
  @IsEnum(Rol, { message: 'rol no es válido.' })
  rol?: Rol;

  @ApiPropertyOptional({ description: 'Solo activos (true) o solo inactivos (false).' })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean({ message: 'activo debe ser verdadero o falso.' })
  activo?: boolean;

  @ApiPropertyOptional({ example: 'ana', description: 'Texto contenido en el correo.' })
  @IsOptional()
  @IsString({ message: 'busqueda debe ser texto.' })
  @MaxLength(100, { message: 'busqueda no puede superar 100 caracteres.' })
  busqueda?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pagina debe ser un número entero.' })
  @Min(1, { message: 'pagina debe ser al menos 1.' })
  pagina: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'porPagina debe ser un número entero.' })
  @Min(1, { message: 'porPagina debe ser al menos 1.' })
  @Max(100, { message: 'porPagina no puede ser mayor que 100.' })
  porPagina: number = 20;
}

export class CambiarEstadoUsuarioDto {
  @ApiProperty({ example: false, description: 'true activa la cuenta; false la desactiva y cierra sus sesiones.' })
  @IsBoolean({ message: 'activo debe ser verdadero o falso.' })
  activo!: boolean;
}

export class RolAsignarDto {
  @ApiProperty({ enum: Rol, example: Rol.APROBADOR })
  @IsEnum(Rol, { message: 'rol no es válido.' })
  rol!: Rol;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Dependencia a la que se acota el rol. Obligatoria para APROBADOR; opcional para RESPONSABLE_ESPACIO; ' +
      'no admitida en los demás roles.',
  })
  @IsOptional()
  @IsUUID('all', { message: 'dependenciaId debe ser un identificador válido.' })
  dependenciaId?: string;
}

export class ReemplazarRolesDto {
  @ApiProperty({
    type: [RolAsignarDto],
    description: 'Lista completa de roles del usuario: reemplaza a la anterior.',
  })
  @IsArray({ message: 'roles debe ser una lista.' })
  @ArrayMaxSize(20, { message: 'roles no puede tener más de 20 elementos.' })
  @ValidateNested({ each: true })
  @Type(() => RolAsignarDto)
  roles!: RolAsignarDto[];
}

export class RolUsuarioDto {
  @ApiProperty({ enum: Rol })
  rol!: Rol;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  dependenciaId!: string | null;
}

export class UsuarioAdminDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ana.perez@itp.edu.co' })
  correo!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Ana Pérez', description: 'Nombre del perfil, si lo tiene.' })
  nombre!: string | null;

  @ApiProperty({ example: true })
  activo!: boolean;

  @ApiProperty({ example: true })
  correoVerificado!: boolean;

  @ApiProperty({ example: true })
  esInstitucional!: boolean;

  @ApiProperty({ type: [RolUsuarioDto] })
  roles!: RolUsuarioDto[];

  @ApiProperty({ type: String, nullable: true, example: '2026-10-22T15:00:00.000Z' })
  ultimoIngresoEn!: string | null;

  @ApiProperty({ example: '2026-10-01T15:00:00.000Z' })
  creadoEn!: string;
}

export class PaginaUsuariosDto {
  @ApiProperty({ type: [UsuarioAdminDto] })
  datos!: UsuarioAdminDto[];

  @ApiProperty({ example: 40 })
  total!: number;

  @ApiProperty({ example: 1 })
  pagina!: number;

  @ApiProperty({ example: 20 })
  porPagina!: number;
}
