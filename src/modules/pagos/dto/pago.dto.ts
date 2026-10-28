import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { EstadoOrdenPago, MedioPago } from '../../../generated/prisma/enums.js';

export class CrearOrdenPagoDto {
  @ApiProperty({ format: 'uuid', example: '6e1d8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b', description: 'Solicitud cotizada.' })
  @IsUUID('all', { message: 'solicitudId debe ser un identificador válido.' })
  solicitudId!: string;
}

export class SubirSoporteDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Comprobante de consignación en PDF, PNG o JPG de máximo 10 MB (campo multipart «archivo»).',
  })
  archivo!: unknown;
}

export const RESULTADOS_VERIFICACION = ['APROBADA', 'RECHAZADA'] as const;

export class VerificarPagoDto {
  @ApiProperty({ enum: RESULTADOS_VERIFICACION, example: 'APROBADA' })
  @IsIn(RESULTADOS_VERIFICACION, { message: 'resultado debe ser APROBADA o RECHAZADA.' })
  resultado!: (typeof RESULTADOS_VERIFICACION)[number];

  @ApiPropertyOptional({
    example: 'El valor consignado no coincide con la orden.',
    maxLength: 500,
    description: 'Obligatoria si el resultado es RECHAZADA.',
  })
  @IsOptional()
  @IsString({ message: 'observacion debe ser texto.' })
  @MaxLength(500, { message: 'observacion no puede superar 500 caracteres.' })
  observacion?: string;
}

export class FiltrosOrdenesDto {
  @ApiPropertyOptional({ enum: EstadoOrdenPago })
  @IsOptional()
  @IsEnum(EstadoOrdenPago, { message: 'estado no es válido.' })
  estado?: EstadoOrdenPago;

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

export class CuentaRecaudoDto {
  @ApiProperty({ example: 'Banco Agrario' })
  banco!: string;

  @ApiProperty({ example: 'Ahorros' })
  tipo!: string;

  @ApiProperty({ example: '4-0000-0000-0000' })
  numero!: string;

  @ApiProperty({ example: 'Institución Universitaria del Putumayo' })
  titular!: string;

  @ApiProperty({ example: '800.247.940-1' })
  nit!: string;
}

export class OrdenPagoDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'OP-2026-000001', description: 'Referencia que se escribe en la consignación.' })
  referencia!: string;

  @ApiProperty({ example: 350000, description: 'Valor a consignar en pesos enteros (cotización más depósito).' })
  valor!: number;

  @ApiProperty({ enum: MedioPago, example: MedioPago.CONSIGNACION })
  medio!: MedioPago;

  @ApiProperty({ enum: EstadoOrdenPago, example: EstadoOrdenPago.PENDIENTE })
  estado!: EstadoOrdenPago;

  @ApiProperty({ example: '2026-10-24T15:00:00.000Z', description: 'Fecha límite para consignar y cargar el soporte.' })
  venceEn!: string;

  @ApiProperty({ example: true, description: 'Si ya se cargó el comprobante.' })
  tieneSoporte!: boolean;

  @ApiProperty({ type: String, nullable: true, description: 'Observación de tesorería, si la hay.' })
  observacionTesoreria!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '2026-10-23T15:00:00.000Z' })
  pagadoEn!: string | null;

  @ApiProperty({ type: CuentaRecaudoDto, description: 'Cuenta donde se consigna.' })
  cuentaRecaudo!: CuentaRecaudoDto;
}

export class OrdenPagoResumenDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'OP-2026-000001' })
  referencia!: string;

  @ApiProperty({ format: 'uuid' })
  solicitudId!: string;

  @ApiProperty({ type: String, nullable: true, example: 'SOL-2026-0001' })
  consecutivoSolicitud!: string | null;

  @ApiProperty({ example: 350000 })
  valor!: number;

  @ApiProperty({ enum: EstadoOrdenPago })
  estado!: EstadoOrdenPago;

  @ApiProperty({ example: true })
  tieneSoporte!: boolean;

  @ApiProperty({ example: '2026-10-24T15:00:00.000Z' })
  venceEn!: string;

  @ApiProperty({ type: String, nullable: true })
  pagadoEn!: string | null;
}

export class PaginaOrdenesDto {
  @ApiProperty({ type: [OrdenPagoResumenDto] })
  datos!: OrdenPagoResumenDto[];

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ example: 1 })
  pagina!: number;

  @ApiProperty({ example: 20 })
  porPagina!: number;
}

export class VerificacionDto {
  @ApiProperty({ enum: EstadoOrdenPago })
  estadoOrden!: EstadoOrdenPago;

  @ApiProperty({ example: 'CONFIRMADA', description: 'Estado de la solicitud tras la verificación.' })
  estadoSolicitud!: string;
}

export class RegistrarPagoTardioDto {
  @ApiPropertyOptional({
    example: 'Consignación recibida el 27 de octubre, verificada contra el extracto.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'observacion debe ser texto.' })
  @MaxLength(500, { message: 'observacion no puede superar 500 caracteres.' })
  observacion?: string;
}

export class PagoTardioDto {
  @ApiProperty({
    enum: ['CONFIRMADA', 'REEMBOLSO'],
    example: 'CONFIRMADA',
    description:
      'CONFIRMADA: las franjas seguían libres y se volvieron a ocupar. REEMBOLSO: ya no estaban libres, ' +
      'la solicitud sigue vencida y el pago se marcó para reembolso total (RN-02d).',
  })
  resultado!: 'CONFIRMADA' | 'REEMBOLSO';

  @ApiProperty({ example: 'CONFIRMADA', description: 'Estado de la solicitud tras registrar el pago.' })
  estadoSolicitud!: string;

  @ApiProperty({ type: Number, nullable: true, example: 350000, description: 'Valor a reembolsar, si aplica.' })
  valorReembolso!: number | null;
}
