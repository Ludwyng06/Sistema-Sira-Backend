import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles, UsuarioActual, type UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import {
  ActualizarDependenciaDto,
  CrearDependenciaDto,
  DependenciaAdminDto,
  FiltrosDependenciasDto,
  PaginaDependenciasDto,
} from '../dto/dependencia-admin.dto.js';
import { DependenciasAdminService } from '../services/dependencias-admin.service.js';
import type { ContextoAdmin } from '../services/usuarios-admin.service.js';

function contextoDe(ip: string, userAgent: string | undefined, correlacionId: string | undefined): ContextoAdmin {
  return { ip, userAgent: userAgent ?? null, correlacionId: correlacionId ?? null };
}

@ApiTags('Administración')
@ApiBearerAuth()
@Roles('ADMINISTRADOR')
@Controller('dependencias')
export class DependenciasAdminController {
  constructor(private readonly servicio: DependenciasAdminService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista las dependencias.',
    description: 'Paginada por nombre; filtra activas o archivadas.',
  })
  @ApiOkResponse({ type: PaginaDependenciasDto })
  @ApiErrores(400, 401, 403)
  listar(@Query() filtros: FiltrosDependenciasDto): Promise<PaginaDependenciasDto> {
    return this.servicio.listar(filtros);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una dependencia.', description: 'Errores: 404 NO_ENCONTRADO.' })
  @ApiOkResponse({ type: DependenciaAdminDto })
  @ApiErrores(400, 401, 403, 404)
  obtener(@Param('id', new ParseUUIDPipe()) id: string): Promise<DependenciaAdminDto> {
    return this.servicio.obtener(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Crea una dependencia.',
    description:
      'El código es único. El jefe, si se indica, debe ser un usuario activo.\n\n' +
      'Errores: 409 CODIGO_REGISTRADO; 422 JEFE_NO_VALIDO.',
  })
  @ApiCreatedResponse({ type: DependenciaAdminDto })
  @ApiErrores(400, 401, 403, 409, 422)
  crear(
    @Body() datos: CrearDependenciaDto,
    @UsuarioActual() actor: UsuarioAutenticado,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('x-correlation-id') correlacionId: string | undefined,
  ): Promise<DependenciaAdminDto> {
    return this.servicio.crear(datos, actor, contextoDe(ip, userAgent, correlacionId));
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Modifica nombre, centro de costo o jefe.',
    description: 'El código no cambia.\n\nErrores: 404 NO_ENCONTRADO; 422 JEFE_NO_VALIDO.',
  })
  @ApiOkResponse({ type: DependenciaAdminDto })
  @ApiErrores(400, 401, 403, 404, 422)
  actualizar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() datos: ActualizarDependenciaDto,
    @UsuarioActual() actor: UsuarioAutenticado,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('x-correlation-id') correlacionId: string | undefined,
  ): Promise<DependenciaAdminDto> {
    return this.servicio.actualizar(id, datos, actor, contextoDe(ip, userAgent, correlacionId));
  }

  @Patch(':id/archivar')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Archiva una dependencia.',
    description:
      'No se borra. Es idempotente. Se rechaza si aún tiene espacios activos.\n\n' +
      'Errores: 404 NO_ENCONTRADO; 409 DEPENDENCIA_CON_ESPACIOS.',
  })
  @ApiNoContentResponse({ description: 'Dependencia archivada.' })
  @ApiErrores(400, 401, 403, 404, 409)
  archivar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UsuarioActual() actor: UsuarioAutenticado,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('x-correlation-id') correlacionId: string | undefined,
  ): Promise<void> {
    return this.servicio.archivar(id, actor, contextoDe(ip, userAgent, correlacionId));
  }

  @Patch(':id/restaurar')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Restaura una dependencia archivada.',
    description: 'Es idempotente.\n\nErrores: 404 NO_ENCONTRADO.',
  })
  @ApiNoContentResponse({ description: 'Dependencia restaurada.' })
  @ApiErrores(400, 401, 403, 404)
  restaurar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UsuarioActual() actor: UsuarioAutenticado,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('x-correlation-id') correlacionId: string | undefined,
  ): Promise<void> {
    return this.servicio.restaurar(id, actor, contextoDe(ip, userAgent, correlacionId));
  }
}
