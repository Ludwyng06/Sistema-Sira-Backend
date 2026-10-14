import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidationArguments,
} from 'class-validator';
import { TipoDocumentoIdentidad, TipoSolicitante } from '../../../generated/prisma/enums.js';
import {
  CorreoDto,
  MAX_CONTRASENA,
  MIN_CONTRASENA,
  largo,
  largoMinimo,
  noVacio,
  recortar,
  texto,
} from './validacion.js';

const enumeracion = (a: ValidationArguments) => `${a.property} tiene un valor no permitido.`;

const exigeRazonSocial = (o: RegistroDto) =>
  o.tipo === TipoSolicitante.EMPRESA || o.tipo === TipoSolicitante.ENTIDAD;

export class RegistroDto extends CorreoDto {
  @ApiProperty({
    description: `Contraseña, de ${MIN_CONTRASENA} a ${MAX_CONTRASENA} caracteres.`,
    example: 'Clave-segura-2026',
    minLength: MIN_CONTRASENA,
    maxLength: MAX_CONTRASENA,
  })
  @IsString({ message: texto })
  @MinLength(MIN_CONTRASENA, { message: largoMinimo(MIN_CONTRASENA) })
  @MaxLength(MAX_CONTRASENA, { message: largo(MAX_CONTRASENA) })
  contrasena!: string;

  @ApiProperty({
    enum: TipoSolicitante,
    description: 'Si el dominio del correo es institucional el servidor asigna INTERNO sin importar lo enviado.',
    example: TipoSolicitante.PERSONA_NATURAL,
  })
  @IsEnum(TipoSolicitante, { message: enumeracion })
  tipo!: TipoSolicitante;

  @ApiProperty({ description: 'Nombres de la persona o del contacto.', example: 'Ana María' })
  @Transform(recortar)
  @IsString({ message: texto })
  @IsNotEmpty({ message: noVacio })
  @MaxLength(120, { message: largo(120) })
  nombres!: string;

  @ApiPropertyOptional({ description: 'Apellidos.', example: 'Pérez Gómez' })
  @IsOptional()
  @IsString({ message: texto })
  @MaxLength(120, { message: largo(120) })
  apellidos?: string;

  @ApiPropertyOptional({
    description: 'Razón social. Obligatoria si el tipo es EMPRESA o ENTIDAD.',
    example: 'Eventos del Norte S.A.S.',
  })
  @Transform(recortar)
  @ValidateIf((o: RegistroDto) => exigeRazonSocial(o) || (o.razonSocial !== undefined && o.razonSocial !== null))
  @IsString({ message: texto })
  @IsNotEmpty({ message: noVacio })
  @MaxLength(200, { message: largo(200) })
  razonSocial?: string;

  @ApiPropertyOptional({ description: 'Representante legal.', example: 'Carlos Ruiz' })
  @IsOptional()
  @IsString({ message: texto })
  @MaxLength(200, { message: largo(200) })
  representanteLegal?: string;

  @ApiProperty({
    enum: TipoDocumentoIdentidad,
    description: 'Tipo de documento de identidad.',
    example: TipoDocumentoIdentidad.CC,
  })
  @IsEnum(TipoDocumentoIdentidad, { message: enumeracion })
  tipoDocumento!: TipoDocumentoIdentidad;

  @ApiProperty({ description: 'Número de documento: letras, números y guion.', example: '1020304050' })
  @IsString({ message: texto })
  @MinLength(5, { message: largoMinimo(5) })
  @MaxLength(20, { message: largo(20) })
  @Matches(/^[A-Za-z0-9-]*$/, { message: 'numeroDocumento solo admite letras, números y guion.' })
  numeroDocumento!: string;

  @ApiProperty({ description: 'Teléfono de 7 a 15 dígitos; admite un + inicial.', example: '+573001234567' })
  @IsString({ message: texto })
  @Matches(/^\+?\d{7,15}$/, {
    message: 'telefono debe tener entre 7 y 15 dígitos y puede iniciar con +.',
  })
  telefono!: string;

  @ApiPropertyOptional({ description: 'Dirección de contacto.', example: 'Calle 10 # 5-20' })
  @IsOptional()
  @IsString({ message: texto })
  @MaxLength(200, { message: largo(200) })
  direccion?: string;

  @ApiPropertyOptional({ description: 'Municipio.', example: 'Mocoa' })
  @IsOptional()
  @IsString({ message: texto })
  @MaxLength(100, { message: largo(100) })
  municipio?: string;

  @ApiPropertyOptional({
    description: 'Identificador de la dependencia (solo usuarios internos).',
    example: '3f2b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b',
  })
  @IsOptional()
  @IsUUID(undefined, { message: (a: ValidationArguments) => `${a.property} debe ser un UUID válido.` })
  dependenciaId?: string;

  @ApiProperty({ description: 'Debe ser true para registrarse.', example: true })
  @Equals(true, { message: 'Debes aceptar la política de tratamiento de datos para registrarte.' })
  aceptaPoliticaDatos!: boolean;

  @ApiProperty({ description: 'Versión de la política aceptada.', example: '2026-01' })
  @Transform(recortar)
  @IsString({ message: texto })
  @IsNotEmpty({ message: noVacio })
  @MaxLength(20, { message: largo(20) })
  versionPolitica!: string;
}
