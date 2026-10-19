import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  EstadoElemento,
  EstadoFisico,
} from '../../../generated/prisma/enums.js';
import { aBooleano } from '../../administracion/dto/transformaciones.js';

const FORMATO_CODIGO = /^[A-Z0-9][A-Z0-9_-]{0,29}$/;
const MENSAJE_CODIGO =
  'debe tener hasta 30 caracteres: mayúsculas, números, guion o guion bajo.';

// ---------------------------------------------------------------- Paginación y filtros

export class PaginacionCatalogoDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pagina debe ser un número entero.' })
  @Min(1, { message: 'pagina debe ser al menos 1.' })
  pagina: number = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'porPagina debe ser un número entero.' })
  @Min(1, { message: 'porPagina debe ser al menos 1.' })
  @Max(100, { message: 'porPagina no puede ser mayor que 100.' })
  porPagina: number = 50;
}

export class FiltrosCatalogoDto extends PaginacionCatalogoDto {
  @ApiPropertyOptional({
    description: 'Solo activos (true) o solo archivados (false).',
  })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean({ message: 'activo debe ser verdadero o falso.' })
  activo?: boolean;
}

export class FiltrosBloquesDto extends FiltrosCatalogoDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Solo los bloques de esta sede.',
  })
  @IsOptional()
  @IsUUID('all', { message: 'sedeId debe ser un identificador válido.' })
  sedeId?: string;
}

export class FiltrosElementosDto extends PaginacionCatalogoDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Solo los elementos de este espacio.',
  })
  @IsOptional()
  @IsUUID('all', { message: 'espacioId debe ser un identificador válido.' })
  espacioId?: string;

  @ApiPropertyOptional({ enum: EstadoElemento })
  @IsOptional()
  @IsEnum(EstadoElemento, { message: 'estado no es válido.' })
  estado?: EstadoElemento;
}

// ---------------------------------------------------------------- Sedes

export class CrearSedeDto {
  @ApiProperty({ example: 'MOC', description: 'Código único de la sede.' })
  @IsString({ message: 'codigo debe ser texto.' })
  @Matches(FORMATO_CODIGO, { message: `codigo ${MENSAJE_CODIGO}` })
  codigo!: string;

  @ApiProperty({ example: 'Mocoa', maxLength: 120 })
  @IsString({ message: 'nombre debe ser texto.' })
  @IsNotEmpty({ message: 'nombre es obligatorio.' })
  @MaxLength(120, { message: 'nombre no puede superar 120 caracteres.' })
  nombre!: string;

  @ApiProperty({ example: 'Mocoa', maxLength: 120 })
  @IsString({ message: 'municipio debe ser texto.' })
  @IsNotEmpty({ message: 'municipio es obligatorio.' })
  @MaxLength(120, { message: 'municipio no puede superar 120 caracteres.' })
  municipio!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString({ message: 'direccion debe ser texto.' })
  @MaxLength(200, { message: 'direccion no puede superar 200 caracteres.' })
  direccion?: string;

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @IsString({ message: 'telefono debe ser texto.' })
  @MaxLength(40, { message: 'telefono no puede superar 40 caracteres.' })
  telefono?: string;

  @ApiPropertyOptional({ default: 0, description: 'Posición en los listados.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'orden debe ser un número entero.' })
  @Min(0, { message: 'orden debe ser al menos 0.' })
  orden?: number;
}

export class ActualizarSedeDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString({ message: 'nombre debe ser texto.' })
  @IsNotEmpty({ message: 'nombre no puede estar vacío.' })
  @MaxLength(120, { message: 'nombre no puede superar 120 caracteres.' })
  nombre?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString({ message: 'municipio debe ser texto.' })
  @IsNotEmpty({ message: 'municipio no puede estar vacío.' })
  @MaxLength(120, { message: 'municipio no puede superar 120 caracteres.' })
  municipio?: string;

  @ApiPropertyOptional({
    maxLength: 200,
    nullable: true,
    description: 'null quita la dirección.',
  })
  @IsOptional()
  @IsString({ message: 'direccion debe ser texto.' })
  @MaxLength(200, { message: 'direccion no puede superar 200 caracteres.' })
  direccion?: string | null;

  @ApiPropertyOptional({
    maxLength: 40,
    nullable: true,
    description: 'null quita el teléfono.',
  })
  @IsOptional()
  @IsString({ message: 'telefono debe ser texto.' })
  @MaxLength(40, { message: 'telefono no puede superar 40 caracteres.' })
  telefono?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'orden debe ser un número entero.' })
  @Min(0, { message: 'orden debe ser al menos 0.' })
  orden?: number;
}

export class SedeAdminDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'MOC' })
  codigo!: string;

  @ApiProperty({ example: 'Mocoa' })
  nombre!: string;

  @ApiProperty({ example: 'Mocoa' })
  municipio!: string;

  @ApiProperty({ type: String, nullable: true })
  direccion!: string | null;

  @ApiProperty({ type: String, nullable: true })
  telefono!: string | null;

  @ApiProperty({ example: 0 })
  orden!: number;

  @ApiProperty({ example: true })
  activa!: boolean;

  @ApiProperty({ example: 3, description: 'Bloques activos de la sede.' })
  bloquesActivos!: number;
}

export class PaginaSedesDto {
  @ApiProperty({ type: [SedeAdminDto] })
  datos!: SedeAdminDto[];

  @ApiProperty({ example: 2 })
  total!: number;

  @ApiProperty({ example: 1 })
  pagina!: number;

  @ApiProperty({ example: 50 })
  porPagina!: number;
}

// ---------------------------------------------------------------- Bloques

export class CrearBloqueDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Sede activa a la que pertenece.',
  })
  @IsUUID('all', { message: 'sedeId debe ser un identificador válido.' })
  sedeId!: string;

  @ApiProperty({ example: 'A', description: 'Código único dentro de la sede.' })
  @IsString({ message: 'codigo debe ser texto.' })
  @Matches(FORMATO_CODIGO, { message: `codigo ${MENSAJE_CODIGO}` })
  codigo!: string;

  @ApiProperty({ example: 'Bloque A', maxLength: 120 })
  @IsString({ message: 'nombre debe ser texto.' })
  @IsNotEmpty({ message: 'nombre es obligatorio.' })
  @MaxLength(120, { message: 'nombre no puede superar 120 caracteres.' })
  nombre!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString({ message: 'descripcion debe ser texto.' })
  @MaxLength(1000, { message: 'descripcion no puede superar 1000 caracteres.' })
  descripcion?: string;

  @ApiProperty({ example: 3, minimum: 1, maximum: 30 })
  @Type(() => Number)
  @IsInt({ message: 'numeroPisos debe ser un número entero.' })
  @Min(1, { message: 'numeroPisos debe ser al menos 1.' })
  @Max(30, { message: 'numeroPisos no puede ser mayor que 30.' })
  numeroPisos!: number;

  @ApiPropertyOptional({ default: 0, description: 'Posición en los listados.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'orden debe ser un número entero.' })
  @Min(0, { message: 'orden debe ser al menos 0.' })
  orden?: number;
}

export class ActualizarBloqueDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString({ message: 'nombre debe ser texto.' })
  @IsNotEmpty({ message: 'nombre no puede estar vacío.' })
  @MaxLength(120, { message: 'nombre no puede superar 120 caracteres.' })
  nombre?: string;

  @ApiPropertyOptional({
    maxLength: 1000,
    nullable: true,
    description: 'null quita la descripción.',
  })
  @IsOptional()
  @IsString({ message: 'descripcion debe ser texto.' })
  @MaxLength(1000, { message: 'descripcion no puede superar 1000 caracteres.' })
  descripcion?: string | null;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 30,
    description: 'No puede dejar espacios en pisos que ya no existan.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'numeroPisos debe ser un número entero.' })
  @Min(1, { message: 'numeroPisos debe ser al menos 1.' })
  @Max(30, { message: 'numeroPisos no puede ser mayor que 30.' })
  numeroPisos?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'orden debe ser un número entero.' })
  @Min(0, { message: 'orden debe ser al menos 0.' })
  orden?: number;
}

export class BloqueAdminDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  sedeId!: string;

  @ApiProperty({ example: 'MOC' })
  sedeCodigo!: string;

  @ApiProperty({ example: 'A' })
  codigo!: string;

  @ApiProperty({ example: 'Bloque A' })
  nombre!: string;

  @ApiProperty({ type: String, nullable: true })
  descripcion!: string | null;

  @ApiProperty({ example: 3 })
  numeroPisos!: number;

  @ApiProperty({ example: 0 })
  orden!: number;

  @ApiProperty({ example: true })
  activo!: boolean;

  @ApiProperty({
    example: 12,
    description: 'Espacios no archivados del bloque.',
  })
  espaciosActivos!: number;
}

export class PaginaBloquesDto {
  @ApiProperty({ type: [BloqueAdminDto] })
  datos!: BloqueAdminDto[];

  @ApiProperty({ example: 3 })
  total!: number;

  @ApiProperty({ example: 1 })
  pagina!: number;

  @ApiProperty({ example: 50 })
  porPagina!: number;
}

// ---------------------------------------------------------------- Tipos de espacio

export class CrearTipoEspacioDto {
  @ApiProperty({ example: 'AUDITORIO', description: 'Código único del tipo.' })
  @IsString({ message: 'codigo debe ser texto.' })
  @Matches(FORMATO_CODIGO, { message: `codigo ${MENSAJE_CODIGO}` })
  codigo!: string;

  @ApiProperty({ example: 'Auditorio', maxLength: 120 })
  @IsString({ message: 'nombre debe ser texto.' })
  @IsNotEmpty({ message: 'nombre es obligatorio.' })
  @MaxLength(120, { message: 'nombre no puede superar 120 caracteres.' })
  nombre!: string;

  @ApiPropertyOptional({
    default: 3,
    minimum: 0,
    description: 'RN-04: anticipación mínima para solicitar.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'anticipacionMinimaDias debe ser un número entero.' })
  @Min(0, { message: 'anticipacionMinimaDias debe ser al menos 0.' })
  @Max(365, { message: 'anticipacionMinimaDias no puede ser mayor que 365.' })
  anticipacionMinimaDias?: number;

  @ApiPropertyOptional({
    default: true,
    description: 'Si la anticipación se cuenta en días hábiles.',
  })
  @IsOptional()
  @IsBoolean({ message: 'anticipacionEnHabiles debe ser verdadero o falso.' })
  anticipacionEnHabiles?: boolean;

  @ApiPropertyOptional({
    minimum: 1,
    description: 'Aforo desde el cual se exige póliza. Sin valor, nunca.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'aforoExigePoliza debe ser un número entero.' })
  @Min(1, { message: 'aforoExigePoliza debe ser al menos 1.' })
  aforoExigePoliza?: number;

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @IsString({ message: 'icono debe ser texto.' })
  @MaxLength(40, { message: 'icono no puede superar 40 caracteres.' })
  icono?: string;
}

export class ActualizarTipoEspacioDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString({ message: 'nombre debe ser texto.' })
  @IsNotEmpty({ message: 'nombre no puede estar vacío.' })
  @MaxLength(120, { message: 'nombre no puede superar 120 caracteres.' })
  nombre?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'anticipacionMinimaDias debe ser un número entero.' })
  @Min(0, { message: 'anticipacionMinimaDias debe ser al menos 0.' })
  @Max(365, { message: 'anticipacionMinimaDias no puede ser mayor que 365.' })
  anticipacionMinimaDias?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'anticipacionEnHabiles debe ser verdadero o falso.' })
  anticipacionEnHabiles?: boolean;

  @ApiPropertyOptional({
    minimum: 1,
    nullable: true,
    description: 'null quita la exigencia de póliza.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'aforoExigePoliza debe ser un número entero.' })
  @Min(1, { message: 'aforoExigePoliza debe ser al menos 1.' })
  aforoExigePoliza?: number | null;

  @ApiPropertyOptional({
    maxLength: 40,
    nullable: true,
    description: 'null quita el icono.',
  })
  @IsOptional()
  @IsString({ message: 'icono debe ser texto.' })
  @MaxLength(40, { message: 'icono no puede superar 40 caracteres.' })
  icono?: string | null;
}

export class TipoEspacioAdminDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'AUDITORIO' })
  codigo!: string;

  @ApiProperty({ example: 'Auditorio' })
  nombre!: string;

  @ApiProperty({ example: 3 })
  anticipacionMinimaDias!: number;

  @ApiProperty({ example: true })
  anticipacionEnHabiles!: boolean;

  @ApiProperty({ type: Number, nullable: true })
  aforoExigePoliza!: number | null;

  @ApiProperty({ type: String, nullable: true })
  icono!: string | null;

  @ApiProperty({ example: true })
  activo!: boolean;

  @ApiProperty({
    example: 4,
    description: 'Espacios no archivados de este tipo.',
  })
  espaciosActivos!: number;
}

export class PaginaTiposEspacioDto {
  @ApiProperty({ type: [TipoEspacioAdminDto] })
  datos!: TipoEspacioAdminDto[];

  @ApiProperty({ example: 5 })
  total!: number;

  @ApiProperty({ example: 1 })
  pagina!: number;

  @ApiProperty({ example: 50 })
  porPagina!: number;
}

// ---------------------------------------------------------------- Elementos

export class CrearElementoDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Espacio (no archivado) donde está el elemento.',
  })
  @IsUUID('all', { message: 'espacioId debe ser un identificador válido.' })
  espacioId!: string;

  @ApiProperty({ example: 'Videobeam', maxLength: 120 })
  @IsString({ message: 'nombre debe ser texto.' })
  @IsNotEmpty({ message: 'nombre es obligatorio.' })
  @MaxLength(120, { message: 'nombre no puede superar 120 caracteres.' })
  nombre!: string;

  @ApiPropertyOptional({
    example: 'ITP-004512',
    description: 'Placa de inventario. Única en toda la institución.',
  })
  @IsOptional()
  @IsString({ message: 'placaInventario debe ser texto.' })
  @IsNotEmpty({ message: 'placaInventario no puede estar vacía.' })
  @MaxLength(60, { message: 'placaInventario no puede superar 60 caracteres.' })
  placaInventario?: string;

  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @IsString({ message: 'marca debe ser texto.' })
  @MaxLength(60, { message: 'marca no puede superar 60 caracteres.' })
  marca?: string;

  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @IsString({ message: 'modelo debe ser texto.' })
  @MaxLength(60, { message: 'modelo no puede superar 60 caracteres.' })
  modelo?: string;

  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @IsString({ message: 'serie debe ser texto.' })
  @MaxLength(60, { message: 'serie no puede superar 60 caracteres.' })
  serie?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'cantidad debe ser un número entero.' })
  @Min(1, { message: 'cantidad debe ser al menos 1.' })
  @Max(100_000, { message: 'cantidad no puede ser mayor que 100000.' })
  cantidad?: number;

  @ApiPropertyOptional({ default: 'unidad', maxLength: 30 })
  @IsOptional()
  @IsString({ message: 'unidad debe ser texto.' })
  @IsNotEmpty({ message: 'unidad no puede estar vacía.' })
  @MaxLength(30, { message: 'unidad no puede superar 30 caracteres.' })
  unidad?: string;

  @ApiPropertyOptional({ enum: EstadoFisico, default: EstadoFisico.BUENO })
  @IsOptional()
  @IsEnum(EstadoFisico, { message: 'estadoFisico no es válido.' })
  estadoFisico?: EstadoFisico;

  @ApiPropertyOptional({
    example: 2500000,
    minimum: 0,
    description: 'Pesos enteros.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'valorUnitario debe ser un número entero en pesos.' })
  @Min(0, { message: 'valorUnitario debe ser al menos 0.' })
  @Max(2_000_000_000, { message: 'valorUnitario supera el máximo permitido.' })
  valorUnitario?: number;

  @ApiPropertyOptional({ example: '2024-03-15', description: 'AAAA-MM-DD.' })
  @IsOptional()
  @IsDateString(
    { strict: true },
    { message: 'fechaAdquisicion debe tener el formato AAAA-MM-DD.' },
  )
  fechaAdquisicion?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'vidaUtilMeses debe ser un número entero.' })
  @Min(1, { message: 'vidaUtilMeses debe ser al menos 1.' })
  vidaUtilMeses?: number;

  @ApiPropertyOptional({
    default: false,
    description: 'Si se puede prestar como servicio.',
  })
  @IsOptional()
  @IsBoolean({ message: 'esPrestable debe ser verdadero o falso.' })
  esPrestable?: boolean;
}

export class ActualizarElementoDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString({ message: 'nombre debe ser texto.' })
  @IsNotEmpty({ message: 'nombre no puede estar vacío.' })
  @MaxLength(120, { message: 'nombre no puede superar 120 caracteres.' })
  nombre?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Traslada el elemento a otro espacio (no archivado).',
  })
  @IsOptional()
  @IsUUID('all', { message: 'espacioId debe ser un identificador válido.' })
  espacioId?: string;

  @ApiPropertyOptional({
    maxLength: 60,
    nullable: true,
    description: 'null quita la placa.',
  })
  @IsOptional()
  @IsString({ message: 'placaInventario debe ser texto.' })
  @IsNotEmpty({ message: 'placaInventario no puede estar vacía.' })
  @MaxLength(60, { message: 'placaInventario no puede superar 60 caracteres.' })
  placaInventario?: string | null;

  @ApiPropertyOptional({ maxLength: 60, nullable: true })
  @IsOptional()
  @IsString({ message: 'marca debe ser texto.' })
  @MaxLength(60, { message: 'marca no puede superar 60 caracteres.' })
  marca?: string | null;

  @ApiPropertyOptional({ maxLength: 60, nullable: true })
  @IsOptional()
  @IsString({ message: 'modelo debe ser texto.' })
  @MaxLength(60, { message: 'modelo no puede superar 60 caracteres.' })
  modelo?: string | null;

  @ApiPropertyOptional({ maxLength: 60, nullable: true })
  @IsOptional()
  @IsString({ message: 'serie debe ser texto.' })
  @MaxLength(60, { message: 'serie no puede superar 60 caracteres.' })
  serie?: string | null;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'cantidad debe ser un número entero.' })
  @Min(1, { message: 'cantidad debe ser al menos 1.' })
  @Max(100_000, { message: 'cantidad no puede ser mayor que 100000.' })
  cantidad?: number;

  @ApiPropertyOptional({ maxLength: 30 })
  @IsOptional()
  @IsString({ message: 'unidad debe ser texto.' })
  @IsNotEmpty({ message: 'unidad no puede estar vacía.' })
  @MaxLength(30, { message: 'unidad no puede superar 30 caracteres.' })
  unidad?: string;

  @ApiPropertyOptional({ enum: EstadoFisico })
  @IsOptional()
  @IsEnum(EstadoFisico, { message: 'estadoFisico no es válido.' })
  estadoFisico?: EstadoFisico;

  @ApiPropertyOptional({
    enum: EstadoElemento,
    description: 'DADO_DE_BAJA retira el elemento del servicio sin borrarlo.',
  })
  @IsOptional()
  @IsEnum(EstadoElemento, { message: 'estado no es válido.' })
  estado?: EstadoElemento;

  @ApiPropertyOptional({
    minimum: 0,
    nullable: true,
    description: 'Pesos enteros.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'valorUnitario debe ser un número entero en pesos.' })
  @Min(0, { message: 'valorUnitario debe ser al menos 0.' })
  @Max(2_000_000_000, { message: 'valorUnitario supera el máximo permitido.' })
  valorUnitario?: number | null;

  @ApiPropertyOptional({ nullable: true, example: '2024-03-15' })
  @IsOptional()
  @IsDateString(
    { strict: true },
    { message: 'fechaAdquisicion debe tener el formato AAAA-MM-DD.' },
  )
  fechaAdquisicion?: string | null;

  @ApiPropertyOptional({ minimum: 1, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'vidaUtilMeses debe ser un número entero.' })
  @Min(1, { message: 'vidaUtilMeses debe ser al menos 1.' })
  vidaUtilMeses?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'esPrestable debe ser verdadero o falso.' })
  esPrestable?: boolean;
}

export class ElementoAdminDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  espacioId!: string;

  @ApiProperty({ example: 'A-101' })
  espacioCodigo!: string;

  @ApiProperty({ example: 'Videobeam' })
  nombre!: string;

  @ApiProperty({ type: String, nullable: true })
  placaInventario!: string | null;

  @ApiProperty({ type: String, nullable: true })
  marca!: string | null;

  @ApiProperty({ type: String, nullable: true })
  modelo!: string | null;

  @ApiProperty({ type: String, nullable: true })
  serie!: string | null;

  @ApiProperty({ example: 1 })
  cantidad!: number;

  @ApiProperty({ example: 'unidad' })
  unidad!: string;

  @ApiProperty({ enum: EstadoFisico })
  estadoFisico!: EstadoFisico;

  @ApiProperty({ enum: EstadoElemento })
  estado!: EstadoElemento;

  @ApiProperty({ type: Number, nullable: true })
  valorUnitario!: number | null;

  @ApiProperty({ type: String, nullable: true, example: '2024-03-15' })
  fechaAdquisicion!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  vidaUtilMeses!: number | null;

  @ApiProperty({ example: false })
  esPrestable!: boolean;
}

export class PaginaElementosDto {
  @ApiProperty({ type: [ElementoAdminDto] })
  datos!: ElementoAdminDto[];

  @ApiProperty({ example: 20 })
  total!: number;

  @ApiProperty({ example: 1 })
  pagina!: number;

  @ApiProperty({ example: 50 })
  porPagina!: number;
}
