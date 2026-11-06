import { Body, Controller, Get, Headers, Ip, Param, ParseUUIDPipe, Patch, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles, UsuarioActual, type UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import {
  CambiarEstadoUsuarioDto,
  FiltrosUsuariosDto,
  PaginaUsuariosDto,
  ReemplazarRolesDto,
  UsuarioAdminDto,
} from '../dto/usuario-admin.dto.js';
import { UsuariosAdminService } from '../services/usuarios-admin.service.js';

@ApiTags('Administración')
@ApiBearerAuth()
@Roles('ADMINISTRADOR')
@Controller('usuarios')
export class UsuariosAdminController {
  constructor(private readonly servicio: UsuariosAdminService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista los usuarios.',
    description:
      'Paginada, de la más reciente a la más antigua. Filtra por rol, estado y texto del correo. Nunca ' +
      'devuelve contraseñas ni secretos.',
  })
  @ApiOkResponse({ type: PaginaUsuariosDto })
  @ApiErrores(400, 401, 403)
  listar(@Query() filtros: FiltrosUsuariosDto): Promise<PaginaUsuariosDto> {
    return this.servicio.listar(filtros);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un usuario.', description: 'Errores: 404 NO_ENCONTRADO.' })
  @ApiOkResponse({ type: UsuarioAdminDto })
  @ApiErrores(400, 401, 403, 404)
  obtener(@Param('id', new ParseUUIDPipe()) id: string): Promise<UsuarioAdminDto> {
    return this.servicio.obtener(id);
  }

  @Patch(':id/estado')
  @ApiOperation({
    summary: 'Activa o desactiva una cuenta.',
    description:
      'Desactivar cierra todas las sesiones del usuario y queda en la bitácora. Un administrador no puede ' +
      'desactivarse a sí mismo ni dejar el sistema sin administradores activos.\n\n' +
      'Errores: 404 NO_ENCONTRADO; 409 AUTODESACTIVACION o ULTIMO_ADMINISTRADOR.',
  })
  @ApiOkResponse({ type: UsuarioAdminDto })
  @ApiErrores(400, 401, 403, 404, 409)
  cambiarEstado(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() datos: CambiarEstadoUsuarioDto,
    @UsuarioActual() actor: UsuarioAutenticado,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('x-correlation-id') correlacionId: string | undefined,
  ): Promise<UsuarioAdminDto> {
    return this.servicio.cambiarEstado(id, datos.activo, actor, {
      ip,
      userAgent: userAgent ?? null,
      correlacionId: correlacionId ?? null,
    });
  }

  @Put(':id/roles')
  @ApiOperation({
    summary: 'Reemplaza los roles de un usuario.',
    description:
      'La lista enviada reemplaza a la actual. APROBADOR exige dependencia; RESPONSABLE_ESPACIO la admite ' +
      'opcional; SOLICITANTE, ADMINISTRADOR, TESORERIA y AUDITOR no la admiten. No se puede quitar el último ' +
      'administrador activo. Las sesiones del usuario se cierran para que sus permisos se regeneren.\n\n' +
      'Errores: 404 NO_ENCONTRADO o DEPENDENCIA_NO_ENCONTRADA; 409 ULTIMO_ADMINISTRADOR; ' +
      '422 ROL_DUPLICADO, DEPENDENCIA_REQUERIDA o DEPENDENCIA_NO_ADMITIDA.',
  })
  @ApiOkResponse({ type: UsuarioAdminDto })
  @ApiErrores(400, 401, 403, 404, 409, 422)
  reemplazarRoles(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() datos: ReemplazarRolesDto,
    @UsuarioActual() actor: UsuarioAutenticado,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('x-correlation-id') correlacionId: string | undefined,
  ): Promise<UsuarioAdminDto> {
    return this.servicio.reemplazarRoles(id, datos, actor, {
      ip,
      userAgent: userAgent ?? null,
      correlacionId: correlacionId ?? null,
    });
  }
}
