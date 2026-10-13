import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CodigoNombreDto {
  @ApiProperty({ example: 'MOC' })
  codigo!: string;

  @ApiProperty({ example: 'Mocoa' })
  nombre!: string;
}

export class FotoDto {
  @ApiProperty({ example: 'http://localhost:9000/sira/publico/espacios/b-101-tarjeta.webp' })
  url!: string;

  @ApiProperty({ example: 'Vista frontal del Auditorio Mayor' })
  alt!: string;
}

export class DotacionDto {
  @ApiProperty({ example: 'Videobeam' })
  nombre!: string;

  @ApiProperty({ example: 1 })
  cantidad!: number;
}

export class AforoDto {
  @ApiProperty({ enum: ['NO_CABE', 'ADECUADO', 'SOBRA_ESPACIO'] })
  nivel!: 'NO_CABE' | 'ADECUADO' | 'SOBRA_ESPACIO';

  @ApiProperty({ example: 0.33, description: 'Fracción de ocupación (asistentes / capacidad).' })
  ocupacion!: number;

  @ApiProperty({ example: 'Capacidad suficiente para 40 personas.' })
  mensaje!: string;
}

export class TarjetaEspacioDto {
  @ApiProperty({ example: 'B-101' })
  codigo!: string;

  @ApiProperty({ example: 'Auditorio Mayor' })
  nombre!: string;

  @ApiProperty({ example: 1 })
  piso!: number;

  @ApiProperty({ example: 300 })
  capacidadPersonas!: number;

  @ApiProperty({ type: CodigoNombreDto })
  tipo!: CodigoNombreDto;

  @ApiProperty({ type: CodigoNombreDto })
  bloque!: CodigoNombreDto;

  @ApiProperty({ type: CodigoNombreDto })
  sede!: CodigoNombreDto;

  @ApiProperty({ type: FotoDto, nullable: true })
  portada!: FotoDto | null;

  @ApiProperty({ type: [DotacionDto], description: 'Hasta 4 elementos en servicio.' })
  dotacion!: DotacionDto[];

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 50000,
    description: 'Menor tarifa externa vigente en pesos enteros. Nunca usa la tarifa interna.',
  })
  tarifaDesde!: number | null;

  @ApiPropertyOptional({
    type: AforoDto,
    description: 'Solo si la consulta incluye `asistentes`.',
  })
  aforo?: AforoDto;
}

export class ConteoPorTipoDto {
  @ApiProperty({ example: 'AULA' })
  tipo!: string;

  @ApiProperty({ example: 'Aula' })
  nombre!: string;

  @ApiProperty({ example: 3 })
  total!: number;
}

export class SedeResumenDto {
  @ApiProperty({ example: 'MOC' })
  codigo!: string;

  @ApiProperty({ example: 'Mocoa' })
  nombre!: string;

  @ApiProperty({ example: 'Mocoa' })
  municipio!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  direccion!: string | null;

  @ApiProperty({ example: 3 })
  totalBloques!: number;

  @ApiProperty({ example: 12 })
  totalEspacios!: number;
}

export class BloqueResumenDto {
  @ApiProperty({ example: 'A' })
  codigo!: string;

  @ApiProperty({ example: 'Bloque A' })
  nombre!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  descripcion!: string | null;

  @ApiProperty({ example: 3 })
  numeroPisos!: number;

  @ApiProperty({ type: String, nullable: true })
  planoUrl!: string | null;

  @ApiProperty({ type: FotoDto, nullable: true })
  foto!: FotoDto | null;

  @ApiProperty({ example: 5 })
  totalEspacios!: number;

  @ApiProperty({ example: 40, description: 'Mayor capacidad entre los espacios del bloque.' })
  capacidadMaxima!: number;

  @ApiProperty({ type: [ConteoPorTipoDto] })
  conteoPorTipo!: ConteoPorTipoDto[];
}

export class PisoDto {
  @ApiProperty({ example: 1 })
  piso!: number;

  @ApiProperty({ type: [TarjetaEspacioDto] })
  espacios!: TarjetaEspacioDto[];
}

export class BloqueDetalleDto {
  @ApiProperty({ example: 'A' })
  codigo!: string;

  @ApiProperty({ example: 'Bloque A' })
  nombre!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  descripcion!: string | null;

  @ApiProperty({ type: CodigoNombreDto })
  sede!: CodigoNombreDto;

  @ApiProperty({ example: 3 })
  numeroPisos!: number;

  @ApiProperty({ type: String, nullable: true })
  planoUrl!: string | null;

  @ApiProperty({ type: [ConteoPorTipoDto], description: 'Tipos de espacio presentes en el bloque.' })
  tipos!: ConteoPorTipoDto[];

  @ApiProperty({ type: [PisoDto] })
  pisos!: PisoDto[];
}

export class PaginaEspaciosDto {
  @ApiProperty({ type: [TarjetaEspacioDto] })
  datos!: TarjetaEspacioDto[];

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ example: 1 })
  pagina!: number;

  @ApiProperty({ example: 24 })
  porPagina!: number;
}

export class TipoEspacioDto {
  @ApiProperty({ example: 'AULA' })
  codigo!: string;

  @ApiProperty({ example: 'Aula' })
  nombre!: string;

  @ApiProperty({ example: 2 })
  anticipacionMinimaDias!: number;

  @ApiProperty({ example: true })
  anticipacionEnHabiles!: boolean;

  @ApiProperty({ type: Number, nullable: true, example: 150 })
  aforoExigePoliza!: number | null;

  @ApiProperty({ type: String, nullable: true })
  icono!: string | null;
}

export class FotoDetalleDto {
  @ApiProperty() urlDetalle!: string;
  @ApiProperty() urlTarjeta!: string;
  @ApiProperty() urlMiniatura!: string;
  @ApiProperty() alt!: string;
  @ApiProperty() esPortada!: boolean;
}

export class ElementoFichaDto {
  @ApiProperty({ example: 'Videobeam' })
  nombre!: string;

  @ApiProperty({ example: 1 })
  cantidad!: number;

  @ApiProperty({ example: 'unidad' })
  unidad!: string;
}

export class TarifaPublicaDto {
  @ApiProperty({ enum: ['PERSONA_NATURAL', 'EMPRESA', 'ENTIDAD'] })
  tipoSolicitante!: string;

  @ApiProperty({ type: String, nullable: true, example: 'HORA' })
  unidad!: string | null;

  @ApiProperty({ example: 50000, description: 'Pesos enteros.' })
  valor!: number;

  @ApiProperty({ example: false })
  ivaAplica!: boolean;
}

export class HorarioDto {
  @ApiProperty({ example: 1, description: '0 = domingo.' })
  diaSemana!: number;

  @ApiProperty({ example: '06:00' })
  abre!: string;

  @ApiProperty({ example: '22:00' })
  cierra!: string;
}

export class FichaEspacioDto extends TarjetaEspacioDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  descripcion!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  condicionesUso!: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  areaM2!: number | null;

  @ApiProperty({ example: 0 })
  minutosMontaje!: number;

  @ApiProperty({ example: 0 })
  minutosDesmontaje!: number;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Depósito fijo en pesos.' })
  depositoValorFijo!: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Depósito como porcentaje.' })
  depositoPorcentaje!: number | null;

  @ApiProperty({ type: [FotoDetalleDto] })
  fotos!: FotoDetalleDto[];

  @ApiProperty({ type: [ElementoFichaDto], description: 'Dotación completa en servicio.' })
  elementos!: ElementoFichaDto[];

  @ApiProperty({ type: [TarifaPublicaDto], description: 'Tarifas externas vigentes.' })
  tarifas!: TarifaPublicaDto[];

  @ApiProperty({ type: [HorarioDto] })
  horarios!: HorarioDto[];

  @ApiProperty({ type: TipoEspacioDto })
  reglasTipo!: TipoEspacioDto;
}

export class EspacioCreadoDto {
  @ApiProperty({ example: 'A-401' })
  codigo!: string;

  @ApiProperty({ example: 'Aula 401' })
  nombre!: string;

  @ApiProperty({ example: 4 })
  piso!: number;

  @ApiProperty({ example: 30 })
  capacidadPersonas!: number;

  @ApiProperty({ type: CodigoNombreDto })
  tipo!: CodigoNombreDto;

  @ApiProperty({ type: CodigoNombreDto })
  bloque!: CodigoNombreDto;

  @ApiProperty({ type: CodigoNombreDto })
  sede!: CodigoNombreDto;
}
