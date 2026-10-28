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
  ActualizarBloqueDto,
  CrearBloqueDto,
  BloqueAdminDto,
  FiltrosBloquesDto,
  PaginaBloquesDto,
} from '../dto/catalogo-admin.dto.js';
import { BloquesAdminService } from '../services/bloques-admin.service.js';

@ApiTags('Inventario · administración')
@ApiBearerAuth()
@Roles('ADMINISTRADOR')
@Controller('bloques')
export class BloquesAdminController {
  constructor(private readonly servicio: BloquesAdminService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista los bloques (activos y archivados).',
    description: 'Paginada. El listado público solo muestra los activos.',
  })
  @ApiOkResponse({ type: PaginaBloquesDto })
  @ApiErrores(400, 401, 403)
  listar(@Query() filtros: FiltrosBloquesDto): Promise<PaginaBloquesDto> {
    return this.servicio.listar(filtros);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalle del bloque.',
    description: 'Errores: 404 NO_ENCONTRADO.',
  })
  @ApiOkResponse({ type: BloqueAdminDto })
  @ApiErrores(400, 401, 403, 404)
  obtener(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<BloqueAdminDto> {
    return this.servicio.obtener(id);
  }

  @Post()
  @Auditar('BLOQUE_CREADO', 'Bloque')
  @ApiOperation({
    summary: 'Crea el bloque.',
    description:
      'Errores: 404 NO_ENCONTRADO (sede); 409 CODIGO_REGISTRADO; 422 SEDE_ARCHIVADA.',
  })
  @ApiCreatedResponse({ type: BloqueAdminDto })
  @ApiErrores(400, 401, 403, 404, 409, 422)
  crear(@Body() datos: CrearBloqueDto): Promise<BloqueAdminDto> {
    return this.servicio.crear(datos);
  }

  @Patch(':id')
  @Auditar('BLOQUE_ACTUALIZADO', 'Bloque')
  @ApiOperation({
    summary: 'Modifica el bloque.',
    description:
      'El código no cambia.\n\nErrores: 404 NO_ENCONTRADO; 422 PISOS_CON_ESPACIOS.',
  })
  @ApiOkResponse({ type: BloqueAdminDto })
  @ApiErrores(400, 401, 403, 404, 422)
  actualizar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() datos: ActualizarBloqueDto,
  ): Promise<BloqueAdminDto> {
    return this.servicio.actualizar(id, datos);
  }

  @Patch(':id/archivar')
  @Auditar('BLOQUE_ARCHIVADO', 'Bloque')
  @ApiOperation({
    summary: 'Archiva el bloque.',
    description:
      'No se borra. Es idempotente.\n\nErrores: 404 NO_ENCONTRADO; 409 BLOQUE_CON_ESPACIOS.',
  })
  @ApiOkResponse({ type: BloqueAdminDto })
  @ApiErrores(400, 401, 403, 404, 409)
  archivar(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<BloqueAdminDto> {
    return this.servicio.archivar(id);
  }

  @Patch(':id/restaurar')
  @Auditar('BLOQUE_RESTAURADO', 'Bloque')
  @ApiOperation({
    summary: 'Restaura el bloque archivado.',
    description:
      'Es idempotente.\n\nErrores: 404 NO_ENCONTRADO. 422 SEDE_ARCHIVADA.',
  })
  @ApiOkResponse({ type: BloqueAdminDto })
  @ApiErrores(400, 401, 403, 404, 422)
  restaurar(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<BloqueAdminDto> {
    return this.servicio.restaurar(id);
  }
}
