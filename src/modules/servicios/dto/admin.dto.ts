import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CategoriaServicio, TipoProveedor, UnidadCobroServicio } from '../../../generated/prisma/enums.js';

const aBooleano = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

class PaginacionDto {
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

// ---------------------------------------------------------------- Proveedores

export class CrearProveedorDto {
  @ApiProperty({ enum: TipoProveedor, example: TipoProveedor.EXTERNO })
  @IsEnum(TipoProveedor, { message: 'tipo no es válido.' })
  tipo!: TipoProveedor;

  @ApiProperty({ example: 'Sonido Putumayo S.A.S.', maxLength: 150 })
  @IsString({ message: 'nombre debe ser texto.' })
  @IsNotEmpty({ message: 'nombre es obligatorio.' })
  @MaxLength(150, { message: 'nombre no puede superar 150 caracteres.' })
  nombre!: string;

  @ApiPropertyOptional({ example: '900.123.456-7', maxLength: 40 })
  @IsOptional()
  @IsString({ message: 'documento debe ser texto.' })
  @MaxLength(40, { message: 'documento no puede superar 40 caracteres.' })
  documento?: string;

  @ApiPropertyOptional({ example: 'Luis Paredes', maxLength: 120 })
  @IsOptional()
  @IsString({ message: 'contactoNombre debe ser texto.' })
  @MaxLength(120, { message: 'contactoNombre no puede superar 120 caracteres.' })
  contactoNombre?: string;

  @ApiPropertyOptional({ example: 'ventas@sonidoputumayo.co', maxLength: 150 })
  @IsOptional()
  @IsEmail({}, { message: 'contactoCorreo debe ser un correo válido.' })
  @MaxLength(150, { message: 'contactoCorreo no puede superar 150 caracteres.' })
  contactoCorreo?: string;

  @ApiPropertyOptional({ example: '+573001234567', maxLength: 30 })
  @IsOptional()
  @IsString({ message: 'contactoTelefono debe ser texto.' })
  @MaxLength(30, { message: 'contactoTelefono no puede superar 30 caracteres.' })
  contactoTelefono?: string;

  @ApiPropertyOptional({
    example: 10,
    minimum: 0,
    maximum: 100,
    default: 0,
    description: 'Porcentaje que retiene la institución sobre proveedores externos.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'porcentajeAdministracion debe ser un número.' })
  @Min(0, { message: 'porcentajeAdministracion no puede ser negativo.' })
  @Max(100, { message: 'porcentajeAdministracion no puede superar 100.' })
  porcentajeAdministracion?: number;
}

export class ActualizarProveedorDto {
  @ApiPropertyOptional({ enum: TipoProveedor })
  @IsOptional()
  @IsEnum(TipoProveedor, { message: 'tipo no es válido.' })
  tipo?: TipoProveedor;

  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @IsString({ message: 'nombre debe ser texto.' })
  @IsNotEmpty({ message: 'nombre no puede estar vacío.' })
  @MaxLength(150, { message: 'nombre no puede superar 150 caracteres.' })
  nombre?: string;

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @IsString({ message: 'documento debe ser texto.' })
  @MaxLength(40, { message: 'documento no puede superar 40 caracteres.' })
  documento?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString({ message: 'contactoNombre debe ser texto.' })
  @MaxLength(120, { message: 'contactoNombre no puede superar 120 caracteres.' })
  contactoNombre?: string;

  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @IsEmail({}, { message: 'contactoCorreo debe ser un correo válido.' })
  @MaxLength(150, { message: 'contactoCorreo no puede superar 150 caracteres.' })
  contactoCorreo?: string;

  @ApiPropertyOptional({ maxLength: 30 })
  @IsOptional()
  @IsString({ message: 'contactoTelefono debe ser texto.' })
  @MaxLength(30, { message: 'contactoTelefono no puede superar 30 caracteres.' })
  contactoTelefono?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'porcentajeAdministracion debe ser un número.' })
  @Min(0, { message: 'porcentajeAdministracion no puede ser negativo.' })
  @Max(100, { message: 'porcentajeAdministracion no puede superar 100.' })
  porcentajeAdministracion?: number;

  @ApiPropertyOptional({
    description: 'false desactiva al proveedor y a todos sus servicios; true solo lo reactiva a él.',
  })
  @IsOptional()
  @IsBoolean({ message: 'activo debe ser verdadero o falso.' })
  activo?: boolean;
}

export class FiltrosProveedoresDto extends PaginacionDto {
  @ApiPropertyOptional({ description: 'Filtra por estado activo.' })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean({ message: 'activo debe ser verdadero o falso.' })
  activo?: boolean;

  @ApiPropertyOptional({ enum: TipoProveedor })
  @IsOptional()
  @IsEnum(TipoProveedor, { message: 'tipo no es válido.' })
  tipo?: TipoProveedor;

  @ApiPropertyOptional({ description: 'Texto contenido en el nombre.' })
  @IsOptional()
  @IsString({ message: 'buscar debe ser texto.' })
  @MaxLength(100, { message: 'buscar no puede superar 100 caracteres.' })
  buscar?: string;
}

export class ProveedorAdminDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: TipoProveedor })
  tipo!: TipoProveedor;

  @ApiProperty({ example: 'Sonido Putumayo S.A.S.' })
  nombre!: string;

  @ApiProperty({ type: String, nullable: true })
  documento!: string | null;

  @ApiProperty({ type: String, nullable: true })
  contactoNombre!: string | null;

  @ApiProperty({ type: String, nullable: true })
  contactoCorreo!: string | null;

  @ApiProperty({ type: String, nullable: true })
  contactoTelefono!: string | null;

  @ApiProperty({ example: 10 })
  porcentajeAdministracion!: number;

  @ApiProperty({ example: true })
  activo!: boolean;

  @ApiProperty({ example: 4, description: 'Servicios activos del proveedor.' })
  serviciosActivos!: number;
}

export class PaginaProveedoresDto {
  @ApiProperty({ type: [ProveedorAdminDto] })
  datos!: ProveedorAdminDto[];

  @ApiProperty({ example: 8 })
  total!: number;

  @ApiProperty({ example: 1 })
  pagina!: number;

  @ApiProperty({ example: 20 })
  porPagina!: number;
}

// ------------------------------------------------------------------ Servicios

export class CrearServicioDto {
  @ApiProperty({ format: 'uuid', description: 'Proveedor activo que presta el servicio.' })
  @IsUUID('all', { message: 'proveedorId debe ser un identificador válido.' })
  proveedorId!: string;

  @ApiProperty({ example: 'Sonido profesional', maxLength: 150 })
  @IsString({ message: 'nombre debe ser texto.' })
  @IsNotEmpty({ message: 'nombre es obligatorio.' })
  @MaxLength(150, { message: 'nombre no puede superar 150 caracteres.' })
  nombre!: string;

  @ApiProperty({ enum: CategoriaServicio, example: CategoriaServicio.TECNICO })
  @IsEnum(CategoriaServicio, { message: 'categoria no es válida.' })
  categoria!: CategoriaServicio;

  @ApiPropertyOptional({ example: 'Consola, parlantes y operador.', maxLength: 500 })
  @IsOptional()
  @IsString({ message: 'descripcion debe ser texto.' })
  @MaxLength(500, { message: 'descripcion no puede superar 500 caracteres.' })
  descripcion?: string;

  @ApiProperty({ enum: UnidadCobroServicio, example: UnidadCobroServicio.EVENTO })
  @IsEnum(UnidadCobroServicio, { message: 'unidadCobro no es válida.' })
  unidadCobro!: UnidadCobroServicio;

  @ApiPropertyOptional({ default: true, description: 'Si el proveedor debe confirmar la disponibilidad.' })
  @IsOptional()
  @IsBoolean({ message: 'requiereConfirmacion debe ser verdadero o falso.' })
  requiereConfirmacion?: boolean;

  @ApiPropertyOptional({ default: 3, minimum: 0, description: 'Días mínimos de anticipación.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'anticipacionMinimaDias debe ser un número entero.' })
  @Min(0, { message: 'anticipacionMinimaDias no puede ser negativo.' })
  anticipacionMinimaDias?: number;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, description: 'Null = sin tope.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'cantidadMaxima debe ser un número entero.' })
  @Min(1, { message: 'cantidadMaxima debe ser al menos 1.' })
  cantidadMaxima?: number | null;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Tipos de espacio donde aplica. Vacío o ausente = todos.',
  })
  @IsOptional()
  @IsArray({ message: 'tiposPermitidos debe ser una lista.' })
  @ArrayMaxSize(50, { message: 'tiposPermitidos no puede tener más de 50 elementos.' })
  @IsUUID('all', { each: true, message: 'tiposPermitidos debe contener identificadores válidos.' })
  tiposPermitidos?: string[];
}

export class ActualizarServicioDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'proveedorId debe ser un identificador válido.' })
  proveedorId?: string;

  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @IsString({ message: 'nombre debe ser texto.' })
  @IsNotEmpty({ message: 'nombre no puede estar vacío.' })
  @MaxLength(150, { message: 'nombre no puede superar 150 caracteres.' })
  nombre?: string;

  @ApiPropertyOptional({ enum: CategoriaServicio })
  @IsOptional()
  @IsEnum(CategoriaServicio, { message: 'categoria no es válida.' })
  categoria?: CategoriaServicio;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString({ message: 'descripcion debe ser texto.' })
  @MaxLength(500, { message: 'descripcion no puede superar 500 caracteres.' })
  descripcion?: string;

  @ApiPropertyOptional({ enum: UnidadCobroServicio })
  @IsOptional()
  @IsEnum(UnidadCobroServicio, { message: 'unidadCobro no es válida.' })
  unidadCobro?: UnidadCobroServicio;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'requiereConfirmacion debe ser verdadero o falso.' })
  requiereConfirmacion?: boolean;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'anticipacionMinimaDias debe ser un número entero.' })
  @Min(0, { message: 'anticipacionMinimaDias no puede ser negativo.' })
  anticipacionMinimaDias?: number;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, description: 'Null quita el tope.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'cantidadMaxima debe ser un número entero.' })
  @Min(1, { message: 'cantidadMaxima debe ser al menos 1.' })
  cantidadMaxima?: number | null;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Reemplaza por completo los tipos permitidos. Lista vacía = todos los tipos.',
  })
  @IsOptional()
  @IsArray({ message: 'tiposPermitidos debe ser una lista.' })
  @ArrayMaxSize(50, { message: 'tiposPermitidos no puede tener más de 50 elementos.' })
  @IsUUID('all', { each: true, message: 'tiposPermitidos debe contener identificadores válidos.' })
  tiposPermitidos?: string[];

  @ApiPropertyOptional({ description: 'Reactivar exige que el proveedor esté activo.' })
  @IsOptional()
  @IsBoolean({ message: 'activo debe ser verdadero o falso.' })
  activo?: boolean;
}

export class FiltrosServiciosAdminDto extends PaginacionDto {
  @ApiPropertyOptional({ description: 'Filtra por estado activo.' })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean({ message: 'activo debe ser verdadero o falso.' })
  activo?: boolean;

  @ApiPropertyOptional({ enum: CategoriaServicio })
  @IsOptional()
  @IsEnum(CategoriaServicio, { message: 'categoria no es válida.' })
  categoria?: CategoriaServicio;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'proveedorId debe ser un identificador válido.' })
  proveedorId?: string;

  @ApiPropertyOptional({ description: 'Texto contenido en el nombre.' })
  @IsOptional()
  @IsString({ message: 'buscar debe ser texto.' })
  @MaxLength(100, { message: 'buscar no puede superar 100 caracteres.' })
  buscar?: string;
}

export class ProveedorResumenDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Sonido Putumayo S.A.S.' })
  nombre!: string;
}

export class TipoEspacioResumenDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'AUDITORIO' })
  codigo!: string;

  @ApiProperty({ example: 'Auditorio' })
  nombre!: string;
}

export class ServicioAdminDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: ProveedorResumenDto })
  proveedor!: ProveedorResumenDto;

  @ApiProperty({ example: 'Sonido profesional' })
  nombre!: string;

  @ApiProperty({ enum: CategoriaServicio })
  categoria!: CategoriaServicio;

  @ApiProperty({ type: String, nullable: true })
  descripcion!: string | null;

  @ApiProperty({ enum: UnidadCobroServicio })
  unidadCobro!: UnidadCobroServicio;

  @ApiProperty({ example: true })
  requiereConfirmacion!: boolean;

  @ApiProperty({ example: 3 })
  anticipacionMinimaDias!: number;

  @ApiProperty({ type: Number, nullable: true })
  cantidadMaxima!: number | null;

  @ApiProperty({ example: true })
  activo!: boolean;

  @ApiProperty({ type: [TipoEspacioResumenDto], description: 'Vacío = aplica a todos los tipos.' })
  tiposPermitidos!: TipoEspacioResumenDto[];
}

export class PaginaServiciosAdminDto {
  @ApiProperty({ type: [ServicioAdminDto] })
  datos!: ServicioAdminDto[];

  @ApiProperty({ example: 25 })
  total!: number;

  @ApiProperty({ example: 1 })
  pagina!: number;

  @ApiProperty({ example: 20 })
  porPagina!: number;
}
