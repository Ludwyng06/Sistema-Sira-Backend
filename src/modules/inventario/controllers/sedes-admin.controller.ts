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
  ActualizarSedeDto,
  CrearSedeDto,
  SedeAdminDto,
  FiltrosCatalogoDto,
  PaginaSedesDto,
} from '../dto/catalogo-admin.dto.js';
import { SedesAdminService } from '../services/sedes-admin.service.js';

@ApiTags('Inventario · administración')
@ApiBearerAuth()
@Roles('ADMINISTRADOR')
@Controller('sedes')
export class SedesAdminController {
  constructor(private readonly servicio: SedesAdminService) {}

  @Get('gestion')
  @ApiOperation({
    summary: 'Lista las sedes (activas y archivadas).',
    description: 'Paginada. El listado público solo muestra los activos.',
  })
  @ApiOkResponse({ type: PaginaSedesDto })
  @ApiErrores(400, 401, 403)
  listar(@Query() filtros: FiltrosCatalogoDto): Promise<PaginaSedesDto> {
    return this.servicio.listar(filtros);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalle de la sede.',
    description: 'Errores: 404 NO_ENCONTRADO.',
  })
  @ApiOkResponse({ type: SedeAdminDto })
  @ApiErrores(400, 401, 403, 404)
  obtener(@Param('id', new ParseUUIDPipe()) id: string): Promise<SedeAdminDto> {
    return this.servicio.obtener(id);
  }

  @Post()
  @Auditar('SEDE_CREADA', 'Sede')
  @ApiOperation({
    summary: 'Crea la sede.',
    description: 'Errores: 409 CODIGO_REGISTRADO.',
  })
  @ApiCreatedResponse({ type: SedeAdminDto })
  @ApiErrores(400, 401, 403, 409)
  crear(@Body() datos: CrearSedeDto): Promise<SedeAdminDto> {
    return this.servicio.crear(datos);
  }

  @Patch(':id')
  @Auditar('SEDE_ACTUALIZADA', 'Sede')
  @ApiOperation({
    summary: 'Modifica la sede.',
    description: 'El código no cambia.\n\nErrores: 404 NO_ENCONTRADO.',
  })
  @ApiOkResponse({ type: SedeAdminDto })
  @ApiErrores(400, 401, 403, 404)
  actualizar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() datos: ActualizarSedeDto,
  ): Promise<SedeAdminDto> {
    return this.servicio.actualizar(id, datos);
  }

  @Patch(':id/archivar')
  @Auditar('SEDE_ARCHIVADA', 'Sede')
  @ApiOperation({
    summary: 'Archiva la sede.',
    description:
      'No se borra. Es idempotente.\n\nErrores: 404 NO_ENCONTRADO; 409 SEDE_CON_BLOQUES.',
  })
  @ApiOkResponse({ type: SedeAdminDto })
  @ApiErrores(400, 401, 403, 404, 409)
  archivar(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<SedeAdminDto> {
    return this.servicio.archivar(id);
  }

  @Patch(':id/restaurar')
  @Auditar('SEDE_RESTAURADA', 'Sede')
  @ApiOperation({
    summary: 'Restaura la sede archivada.',
    description: 'Es idempotente.\n\nErrores: 404 NO_ENCONTRADO.',
  })
  @ApiOkResponse({ type: SedeAdminDto })
  @ApiErrores(400, 401, 403, 404)
  restaurar(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<SedeAdminDto> {
    return this.servicio.restaurar(id);
  }
}
