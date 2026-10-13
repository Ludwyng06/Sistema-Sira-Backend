import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Publico } from '../../../shared/auth/decoradores.js';
import { ConsultaAsistentesDto, FiltrosEspaciosDto } from '../dto/filtros-espacios.dto.js';
import {
  BloqueDetalleDto,
  BloqueResumenDto,
  FichaEspacioDto,
  PaginaEspaciosDto,
  SedeResumenDto,
  TipoEspacioDto,
} from '../dto/respuestas.js';
import { InventarioPublicoService } from '../services/inventario-publico.service.js';

@ApiTags('Inventario')
@Publico()
@Controller()
export class InventarioPublicoController {
  constructor(private readonly servicio: InventarioPublicoService) {}

  @Get('sedes')
  @ApiOperation({ summary: 'Sedes activas con conteo de bloques y espacios.' })
  @ApiOkResponse({ type: [SedeResumenDto] })
  sedes(): Promise<SedeResumenDto[]> {
    return this.servicio.listarSedes();
  }

  @Get('sedes/:sede/bloques')
  @ApiOperation({ summary: 'Bloques de una sede con conteo por tipo de espacio.' })
  @ApiOkResponse({ type: [BloqueResumenDto] })
  @ApiNotFoundResponse({ description: 'La sede no existe.' })
  bloques(@Param('sede') sede: string): Promise<BloqueResumenDto[]> {
    return this.servicio.listarBloques(sede);
  }

  @Get('sedes/:sede/bloques/:bloque')
  @ApiOperation({ summary: 'Bloque con plano y sus espacios agrupados por piso.' })
  @ApiOkResponse({ type: BloqueDetalleDto })
  @ApiNotFoundResponse({ description: 'El bloque no existe.' })
  bloque(
    @Param('sede') sede: string,
    @Param('bloque') bloque: string,
    @Query() consulta: ConsultaAsistentesDto,
  ): Promise<BloqueDetalleDto> {
    return this.servicio.obtenerBloque(sede, bloque, consulta.asistentes);
  }

  @Get('espacios')
  @ApiOperation({ summary: 'Búsqueda paginada de espacios visibles.' })
  @ApiOkResponse({ type: PaginaEspaciosDto })
  espacios(@Query() filtros: FiltrosEspaciosDto): Promise<PaginaEspaciosDto> {
    return this.servicio.buscarEspacios(filtros);
  }

  @Get('espacios/:codigo')
  @ApiOperation({ summary: 'Ficha de un espacio: fotos, dotación, condiciones y tarifas públicas.' })
  @ApiOkResponse({ type: FichaEspacioDto })
  @ApiNotFoundResponse({ description: 'El espacio no existe o no es visible.' })
  espacio(@Param('codigo') codigo: string): Promise<FichaEspacioDto> {
    return this.servicio.obtenerEspacio(codigo);
  }

  @Get('tipos-espacio')
  @ApiOperation({ summary: 'Tipos de espacio activos y sus reglas de anticipación.' })
  @ApiOkResponse({ type: [TipoEspacioDto] })
  tipos(): Promise<TipoEspacioDto[]> {
    return this.servicio.listarTipos();
  }
}
