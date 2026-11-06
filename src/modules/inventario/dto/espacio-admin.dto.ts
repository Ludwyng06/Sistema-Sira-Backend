import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { EstadoEspacio } from '../../../generated/prisma/enums.js';
import { FiltrosCatalogoDto } from './catalogo-admin.dto.js';
import { CodigoNombreDto, HorarioDto } from './respuestas.js';

export class FiltrosEspaciosAdminDto extends FiltrosCatalogoDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'sedeId debe ser un identificador válido.' })
  sedeId?: string;

  @ApiPropertyOptional({ example: 'MOC', description: 'Código de sede; se normaliza a mayúsculas.' })
  @IsOptional()
  @IsString({ message: 'sede debe ser texto.' })
  sede?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'bloqueId debe ser un identificador válido.' })
  bloqueId?: string;

  @ApiPropertyOptional({ example: 'A', description: 'Código de bloque; se normaliza a mayúsculas.' })
  @IsOptional()
  @IsString({ message: 'bloque debe ser texto.' })
  bloque?: string;

  @ApiPropertyOptional({ enum: EstadoEspacio })
  @IsOptional()
  @IsEnum(EstadoEspacio, { message: 'estado no es válido.' })
  estado?: EstadoEspacio;
}

export class EspacioAdminDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'B-101' }) codigo!: string;
  @ApiProperty({ example: 'Auditorio Mayor' }) nombre!: string;
  @ApiProperty() piso!: number;
  @ApiProperty() capacidadPersonas!: number;
  @ApiProperty({ type: Number, nullable: true }) areaM2!: number | null;
  @ApiProperty({ type: String, nullable: true }) descripcion!: string | null;
  @ApiProperty({ type: String, nullable: true }) condicionesUso!: string | null;
  @ApiProperty({ enum: EstadoEspacio }) estado!: EstadoEspacio;
  @ApiProperty() requiereAval!: boolean;
  @ApiProperty() esReservable!: boolean;
  @ApiProperty() minutosMontaje!: number;
  @ApiProperty() minutosDesmontaje!: number;
  @ApiProperty({ type: Number, nullable: true }) depositoValorFijo!: number | null;
  @ApiProperty({ type: Number, nullable: true }) depositoPorcentaje!: number | null;
  @ApiProperty({ type: Number, nullable: true }) valorComercialReferencia!: number | null;
  @ApiProperty({ description: 'Suma de cantidad * valorUnitario de los elementos no dados de baja (RF-INV-07).' })
  valorTotalElementos!: number;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) responsableId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) dependenciaId!: string | null;
  @ApiProperty({ type: String, nullable: true }) dependenciaCodigo!: string | null;
  @ApiProperty({ description: 'Verdadero si el espacio no está archivado.' }) activo!: boolean;
  @ApiProperty({ type: CodigoNombreDto }) tipo!: CodigoNombreDto;
  @ApiProperty({ type: CodigoNombreDto }) bloque!: CodigoNombreDto;
  @ApiProperty({ type: CodigoNombreDto }) sede!: CodigoNombreDto;
  @ApiProperty({ type: [HorarioDto] }) horarios!: HorarioDto[];
}

export class PaginaEspaciosAdminDto {
  @ApiProperty({ type: [EspacioAdminDto] }) datos!: EspacioAdminDto[];
  @ApiProperty() total!: number;
  @ApiProperty() pagina!: number;
  @ApiProperty() porPagina!: number;
}
