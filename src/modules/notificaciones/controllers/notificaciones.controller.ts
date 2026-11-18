import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsuarioActual, type UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import { FiltrosNotificacionesDto, PaginaNotificacionesDto } from '../dto/notificacion.dto.js';
import { NotificacionesService } from '../services/notificaciones.service.js';

@ApiTags('Notificaciones')
@ApiBearerAuth()
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly servicio: NotificacionesService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista las notificaciones propias.',
    description:
      'Paginada, de la más reciente a la más antigua. `soloNoLeidas` filtra las pendientes; `noLeidas` ' +
      'trae el contador total para la campana.',
  })
  @ApiOkResponse({ type: PaginaNotificacionesDto })
  @ApiErrores(400, 401)
  listar(
    @Query() filtros: FiltrosNotificacionesDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<PaginaNotificacionesDto> {
    return this.servicio.listar(filtros, usuario);
  }

  @Patch(':id/leida')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Marca una notificación como leída.',
    description: 'Es idempotente. Una notificación ajena responde 404.\n\nErrores: 404 NO_ENCONTRADO.',
  })
  @ApiNoContentResponse({ description: 'Notificación marcada como leída.' })
  @ApiErrores(400, 401, 404)
  marcarLeida(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    return this.servicio.marcarLeida(id, usuario);
  }
}
