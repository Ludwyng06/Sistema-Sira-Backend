import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import { Auditar } from '../../auditoria/auditar.decorador.js';
import {
  ActualizarTipoEspacioDto,
  CrearTipoEspacioDto,
  TipoEspacioAdminDto,
  FiltrosCatalogoDto,
  PaginaTiposEspacioDto,
} from '../dto/catalogo-admin.dto.js';
import { TiposEspacioAdminService } from '../services/tipos-espacio-admin.service.js';

@ApiTags('Inventario · administración')
@ApiBearerAuth()
@Roles('ADMINISTRADOR')
@Controller('tipos-espacio')
export class TiposEspacioAdminController {
  constructor(private readonly servicio: TiposEspacioAdminService) {}

  @Get('gestion')
  @ApiOperation({
    summary: 'Lista los tipos de espacio (activos y archivados).',
    description: 'Paginada. El listado público solo muestra los activos.',
  })
  @ApiOkResponse({ type: PaginaTiposEspacioDto })
  @ApiErrores(400, 401, 403)
  listar(@Query() filtros: FiltrosCatalogoDto): Promise<PaginaTiposEspacioDto> {
    return this.servicio.listar(filtros);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalle del tipo de espacio.',
    description: 'Errores: 404 NO_ENCONTRADO.',
  })
  @ApiOkResponse({ type: TipoEspacioAdminDto })
  @ApiErrores(400, 401, 403, 404)
  obtener(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<TipoEspacioAdminDto> {
    return this.servicio.obtener(id);
  }

  @Post()
  @Auditar('TIPO_ESPACIO_CREADO', 'TipoEspacio')
  @ApiOperation({
    summary: 'Crea el tipo de espacio.',
    description: 'Errores: 409 CODIGO_REGISTRADO.',
  })
  @ApiCreatedResponse({ type: TipoEspacioAdminDto })
  @ApiErrores(400, 401, 403, 409)
  crear(@Body() datos: CrearTipoEspacioDto): Promise<TipoEspacioAdminDto> {
    return this.servicio.crear(datos);
  }

  @Patch(':id')
  @Auditar('TIPO_ESPACIO_ACTUALIZADO', 'TipoEspacio')
  @ApiOperation({
    summary: 'Modifica el tipo de espacio.',
    description: 'El código no cambia.\n\nErrores: 404 NO_ENCONTRADO.',
  })
  @ApiOkResponse({ type: TipoEspacioAdminDto })
  @ApiErrores(400, 401, 403, 404)
  actualizar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() datos: ActualizarTipoEspacioDto,
  ): Promise<TipoEspacioAdminDto> {
    return this.servicio.actualizar(id, datos);
  }

  @Patch(':id/archivar')
  @Auditar('TIPO_ESPACIO_ARCHIVADO', 'TipoEspacio')
  @ApiOperation({
    summary: 'Archiva el tipo de espacio.',
    description:
      'No se borra. Es idempotente.\n\nErrores: 404 NO_ENCONTRADO; 409 TIPO_CON_ESPACIOS.',
  })
  @ApiOkResponse({ type: TipoEspacioAdminDto })
  @ApiErrores(400, 401, 403, 404, 409)
  archivar(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<TipoEspacioAdminDto> {
    return this.servicio.archivar(id);
  }

  @Patch(':id/restaurar')
  @Auditar('TIPO_ESPACIO_RESTAURADO', 'TipoEspacio')
  @ApiOperation({
    summary: 'Restaura el tipo de espacio archivado.',
    description: 'Es idempotente.\n\nErrores: 404 NO_ENCONTRADO.',
  })
  @ApiOkResponse({ type: TipoEspacioAdminDto })
  @ApiErrores(400, 401, 403, 404)
  restaurar(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<TipoEspacioAdminDto> {
    return this.servicio.restaurar(id);
  }
}
