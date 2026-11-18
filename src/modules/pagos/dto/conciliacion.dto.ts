import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class FechaConciliacionDto {
  @ApiProperty({ example: '2026-11-13', description: 'Día calendario en America/Bogota.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/) fecha!: string;
}
export class TotalConciliacionDto {
  @ApiProperty() cantidad!: number;
  @ApiProperty({ description: 'Pesos enteros.' }) valor!: number;
}
export class TotalesConciliacionDto {
  @ApiProperty({ type: TotalConciliacionDto }) aprobadas!: TotalConciliacionDto;
  @ApiProperty({ type: TotalConciliacionDto }) rechazadas!: TotalConciliacionDto;
  @ApiProperty({ type: TotalConciliacionDto }) pendientes!: TotalConciliacionDto;
  @ApiProperty({ type: TotalConciliacionDto }) anuladas!: TotalConciliacionDto;
}
export class ProveedorConciliacionDto {
  @ApiProperty() proveedor!: string;
  @ApiProperty({ type: TotalConciliacionDto }) aprobadas!: TotalConciliacionDto;
  @ApiProperty({ type: TotalConciliacionDto }) rechazadas!: TotalConciliacionDto;
  @ApiProperty({ type: TotalConciliacionDto }) pendientes!: TotalConciliacionDto;
}
export class FilaConciliacionDto {
  @ApiProperty({ format: 'uuid' }) ordenId!: string;
  @ApiProperty() referencia!: string;
  @ApiProperty({ type: String, nullable: true }) proveedor!: string | null;
  @ApiProperty({ enum: ['PASARELA', 'CONSIGNACION', 'ORDEN_SERVICIO'] }) medio!: 'PASARELA' | 'CONSIGNACION' | 'ORDEN_SERVICIO';
  @ApiProperty() estado!: string;
  @ApiProperty() valor!: number;
  @ApiProperty({ type: String, nullable: true }) transaccionExternaId!: string | null;
  @ApiProperty({ type: String, nullable: true }) pagadoEn!: string | null;
}
export class DiferenciaConciliacionDto {
  @ApiProperty({ type: String, nullable: true }) referencia!: string | null;
  @ApiProperty({ enum: ['VALOR', 'SIN_ORDEN', 'SIN_EXTRACTO', 'ESTADO'] }) tipo!: 'VALOR' | 'SIN_ORDEN' | 'SIN_EXTRACTO' | 'ESTADO';
  @ApiProperty({ type: Number, nullable: true }) valorSistema!: number | null;
  @ApiProperty({ type: Number, nullable: true }) valorExtracto!: number | null;
  @ApiProperty() detalle!: string;
}
export class ConciliacionDto {
  @ApiProperty() fecha!: string;
  @ApiProperty({ format: 'date-time' }) generadoEn!: string;
  @ApiProperty({ type: TotalesConciliacionDto }) totales!: TotalesConciliacionDto;
  @ApiProperty({ type: [ProveedorConciliacionDto] }) porProveedor!: ProveedorConciliacionDto[];
  @ApiProperty({ type: [FilaConciliacionDto] }) filas!: FilaConciliacionDto[];
  @ApiProperty({ type: [DiferenciaConciliacionDto] }) diferencias!: DiferenciaConciliacionDto[];
}
export class ExtractoConciliacionDto {
  @ApiProperty({ type: 'string', format: 'binary', description: 'CSV referencia,valor,fecha; UTF-8, máximo 2 MB.' }) archivo!: unknown;
}
