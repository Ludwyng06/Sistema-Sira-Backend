import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ReservaItemDto, ServicioItemDto } from './items.dto.js';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { EstadoSolicitud, TipoSolicitante } from '../../../generated/prisma/enums.js';

export class CrearSolicitudDto {
  @ApiProperty({ example: 'Congreso de Ingeniería de Sistemas', maxLength: 200 })
  @IsString({ message: 'objetoEvento debe ser texto.' })
  @IsNotEmpty({ message: 'objetoEvento es obligatorio.' })
  @MaxLength(200, { message: 'objetoEvento no puede superar 200 caracteres.' })
  objetoEvento!: string;

  @ApiPropertyOptional({ example: 'Dos jornadas de conferencias y talleres.', maxLength: 1000 })
  @IsOptional()
  @IsString({ message: 'descripcion debe ser texto.' })
  @MaxLength(1000, { message: 'descripcion no puede superar 1000 caracteres.' })
  descripcion?: string;

  @ApiProperty({ example: 120, minimum: 1, maximum: 20000 })
  @Type(() => Number)
  @IsInt({ message: 'asistentesEstimados debe ser un número entero.' })
  @Min(1, { message: 'asistentesEstimados debe ser al menos 1.' })
  @Max(20_000, { message: 'asistentesEstimados no puede superar 20000.' })
  asistentesEstimados!: number;

  @ApiPropertyOptional({ example: 'Carlos Muñoz', maxLength: 120 })
  @IsOptional()
  @IsString({ message: 'responsableEnSitio debe ser texto.' })
  @MaxLength(120, { message: 'responsableEnSitio no puede superar 120 caracteres.' })
  responsableEnSitio?: string;

  @ApiPropertyOptional({ example: '+573001234567', maxLength: 30 })
  @IsOptional()
  @IsString({ message: 'telefonoContacto debe ser texto.' })
  @MaxLength(30, { message: 'telefonoContacto no puede superar 30 caracteres.' })
  telefonoContacto?: string;

  @ApiPropertyOptional({ example: false, description: 'Si el evento es abierto al público.' })
  @IsOptional()
  @IsBoolean({ message: 'eventoPublico debe ser verdadero o falso.' })
  eventoPublico?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Solo cuentas institucionales: declara que el uso es institucional. El servidor decide la exención.',
  })
  @IsOptional()
  @IsBoolean({ message: 'declaraUsoInstitucional debe ser verdadero o falso.' })
  declaraUsoInstitucional?: boolean;
}

export class ActualizarSolicitudDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString({ message: 'objetoEvento debe ser texto.' })
  @IsNotEmpty({ message: 'objetoEvento no puede estar vacío.' })
  @MaxLength(200, { message: 'objetoEvento no puede superar 200 caracteres.' })
  objetoEvento?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString({ message: 'descripcion debe ser texto.' })
  @MaxLength(1000, { message: 'descripcion no puede superar 1000 caracteres.' })
  descripcion?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 20000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'asistentesEstimados debe ser un número entero.' })
  @Min(1, { message: 'asistentesEstimados debe ser al menos 1.' })
  @Max(20_000, { message: 'asistentesEstimados no puede superar 20000.' })
  asistentesEstimados?: number;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString({ message: 'responsableEnSitio debe ser texto.' })
  @MaxLength(120, { message: 'responsableEnSitio no puede superar 120 caracteres.' })
  responsableEnSitio?: string;

  @ApiPropertyOptional({ maxLength: 30 })
  @IsOptional()
  @IsString({ message: 'telefonoContacto debe ser texto.' })
  @MaxLength(30, { message: 'telefonoContacto no puede superar 30 caracteres.' })
  telefonoContacto?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'eventoPublico debe ser verdadero o falso.' })
  eventoPublico?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'declaraUsoInstitucional debe ser verdadero o falso.' })
  declaraUsoInstitucional?: boolean;
}

export const AMBITOS_SOLICITUDES = ['PROPIAS', 'BANDEJA'] as const;
export type AmbitoSolicitudes = (typeof AMBITOS_SOLICITUDES)[number];

export class FiltrosSolicitudesDto {
  @ApiPropertyOptional({
    enum: AMBITOS_SOLICITUDES,
    default: 'PROPIAS',
    description:
      'PROPIAS: las que creaste. BANDEJA: las que debes revisar según tu rol (responsable, aprobador, ' +
      'tesorería, administración o auditoría); nunca incluye borradores ajenos.',
  })
  @IsOptional()
  @IsIn(AMBITOS_SOLICITUDES, { message: 'ambito no es válido.' })
  ambito: AmbitoSolicitudes = 'PROPIAS';

  @ApiPropertyOptional({ enum: EstadoSolicitud })
  @IsOptional()
  @IsEnum(EstadoSolicitud, { message: 'estado no es válido.' })
  estado?: EstadoSolicitud;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pagina debe ser un número entero.' })
  @Min(1, { message: 'pagina debe ser al menos 1.' })
  @Max(100_000, { message: 'pagina no puede ser mayor que 100000.' })
  pagina: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'porPagina debe ser un número entero.' })
  @Min(1, { message: 'porPagina debe ser al menos 1.' })
  @Max(100, { message: 'porPagina no puede ser mayor que 100.' })
  porPagina: number = 20;
}

export class SolicitudDto {
  @ApiProperty({ format: 'uuid', example: '6e1d8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b' })
  id!: string;

  @ApiProperty({ type: String, nullable: true, example: 'SOL-2026-0001', description: 'Null mientras es borrador.' })
  consecutivo!: string | null;

  @ApiProperty({ enum: EstadoSolicitud, example: EstadoSolicitud.BORRADOR })
  estado!: EstadoSolicitud;

  @ApiProperty({ example: 'Congreso de Ingeniería de Sistemas' })
  objetoEvento!: string;

  @ApiProperty({ type: String, nullable: true })
  descripcion!: string | null;

  @ApiProperty({ example: 120 })
  asistentesEstimados!: number;

  @ApiProperty({ type: String, nullable: true })
  responsableEnSitio!: string | null;

  @ApiProperty({ type: String, nullable: true })
  telefonoContacto!: string | null;

  @ApiProperty({ example: false })
  eventoPublico!: boolean;

  @ApiProperty({ example: false })
  declaraUsoInstitucional!: boolean;

  @ApiProperty({ example: false, description: 'Lo calcula el servidor al enviar la solicitud (RN-07).' })
  esExenta!: boolean;

  @ApiProperty({ enum: TipoSolicitante, description: 'Tipo con el que se tarifa; lo define el servidor.' })
  tipoTarifa!: TipoSolicitante;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  dependenciaId!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '2026-11-03T13:00:00.000Z' })
  enviadaEn!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '2026-11-05T13:00:00.000Z' })
  venceEn!: string | null;

  @ApiProperty({ example: '2026-10-21T15:00:00.000Z' })
  creadoEn!: string;

  @ApiProperty({ example: '2026-10-21T15:30:00.000Z' })
  actualizadoEn!: string;
}

export class EspacioSugeridoDto {
  @ApiProperty({ format: 'uuid' })
  espacioId!: string;

  @ApiProperty({ example: 'B-102' })
  codigo!: string;

  @ApiProperty({ example: 'Aula B-102' })
  nombre!: string;

  @ApiProperty({ example: 45 })
  capacidadPersonas!: number;

  @ApiProperty({ example: 'B' })
  bloque!: string;

  @ApiProperty({ example: 'MOC' })
  sede!: string;
}

export class AdvertenciaEnvioDto {
  @ApiProperty({ example: 'ESPACIO_SOBRADO', description: 'No bloquea el envío.' })
  codigo!: string;

  @ApiProperty({
    example: 'Este espacio es para 200 personas. Para 40 puede haber opciones más adecuadas.',
  })
  mensaje!: string;

  @ApiProperty({ format: 'uuid', description: 'Reserva a la que se refiere la advertencia.' })
  reservaId!: string;

  @ApiProperty({ type: [EspacioSugeridoDto], description: 'Alternativas más ajustadas, libres en ese horario.' })
  sugerencias!: EspacioSugeridoDto[];
}

export class SolicitudEnviadaDto extends SolicitudDto {
  @ApiProperty({
    type: [AdvertenciaEnvioDto],
    description: 'Avisos que no impidieron el envío, por ejemplo un espacio demasiado grande para el aforo.',
  })
  advertencias!: AdvertenciaEnvioDto[];
}

export class DecisionHistorialDto {
  @ApiProperty({ enum: ['AVAL', 'APROBACION'] })
  tipo!: string;

  @ApiProperty({ enum: ['APROBADA', 'RECHAZADA', 'DEVUELTA', 'RECLASIFICADA'] })
  resultado!: string;

  @ApiProperty({ type: String, nullable: true })
  motivo!: string | null;

  @ApiProperty({ example: '2026-10-22T10:00:00.000Z' })
  decididaEn!: string;
}

export class CotizacionResumenDto {
  @ApiProperty({ example: 'COT-2026-0001' })
  consecutivo!: string;

  @ApiProperty({ example: 250000 })
  subtotal!: number;

  @ApiProperty({ example: 0 })
  iva!: number;

  @ApiProperty({ example: 250000, description: 'Valor a pagar; 0 si la solicitud es exenta.' })
  total!: number;

  @ApiProperty({ example: 100000 })
  depositoGarantia!: number;

  @ApiProperty({ example: 0, description: 'Solo en solicitudes exentas: lo que se habría cobrado.' })
  valorReferencia!: number;

  @ApiProperty({ example: '2026-10-24T15:00:00.000Z' })
  validaHasta!: string;
}

export class SolicitudDetalleDto extends SolicitudDto {
  @ApiProperty({ type: [ReservaItemDto], description: 'Espacios y horarios solicitados.' })
  reservas!: ReservaItemDto[];

  @ApiProperty({ type: [ServicioItemDto], description: 'Servicios complementarios solicitados.' })
  servicios!: ServicioItemDto[];

  @ApiProperty({ type: [DecisionHistorialDto], description: 'Avales y aprobaciones, de la más antigua a la reciente.' })
  decisiones!: DecisionHistorialDto[];

  @ApiProperty({ type: CotizacionResumenDto, nullable: true, description: 'Última cotización emitida, si hay.' })
  cotizacion!: CotizacionResumenDto | null;
}

export class PaginaSolicitudesDto {
  @ApiProperty({ type: [SolicitudDto] })
  datos!: SolicitudDto[];

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ example: 1 })
  pagina!: number;

  @ApiProperty({ example: 20 })
  porPagina!: number;
}
