import { Body, Controller, Delete, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UsuarioActual, type UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import {
  AgregarReservaDto,
  AgregarServicioDto,
  ReservaItemDto,
  ServicioItemDto,
} from '../dto/items.dto.js';
import { ItemsService } from '../services/items.service.js';

@ApiTags('Solicitudes')
@ApiBearerAuth()
@Controller('solicitudes/:id')
export class ItemsController {
  constructor(private readonly servicio: ItemsService) {}

  @Post('reservas')
  @ApiOperation({
    summary: 'Agrega un espacio y su horario al borrador.',
    description:
      'Estima el valor con el tarifario (no es la cotización). La disponibilidad se valida y se retiene ' +
      'al enviar la solicitud. Cada reserva termina el mismo día en que empieza; máximo 20 por solicitud.\n\n' +
      'Errores: 400 RANGO_INVALIDO; 404 NO_ENCONTRADO; 409 SOLICITUD_NO_EDITABLE o RESERVA_DUPLICADA; ' +
      '422 LIMITE_DE_ITEMS o TARIFA_NO_DEFINIDA.',
  })
  @ApiCreatedResponse({ type: ReservaItemDto })
  @ApiErrores(400, 401, 404, 409, 422)
  agregarReserva(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() datos: AgregarReservaDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<ReservaItemDto> {
    return this.servicio.agregarReserva(id, datos, usuario);
  }

  @Delete('reservas/:itemId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Quita una reserva del borrador.',
    description: 'Errores: 404 NO_ENCONTRADO; 409 SOLICITUD_NO_EDITABLE.',
  })
  @ApiNoContentResponse({ description: 'Reserva quitada.' })
  @ApiErrores(400, 401, 404, 409)
  quitarReserva(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    return this.servicio.quitarReserva(id, itemId, usuario);
  }

  @Post('servicios')
  @ApiOperation({
    summary: 'Agrega un servicio complementario al borrador.',
    description:
      'El valor unitario es la tarifa vigente para el tipo de tarifa de la solicitud (0 si el servicio no tiene ' +
      'tarifa definida). Un servicio no se repite; máximo 30 por solicitud.\n\n' +
      'Errores: 404 NO_ENCONTRADO; 409 SOLICITUD_NO_EDITABLE o SERVICIO_DUPLICADO; ' +
      '422 CANTIDAD_EXCEDIDA o LIMITE_DE_ITEMS.',
  })
  @ApiCreatedResponse({ type: ServicioItemDto })
  @ApiErrores(400, 401, 404, 409, 422)
  agregarServicio(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() datos: AgregarServicioDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<ServicioItemDto> {
    return this.servicio.agregarServicio(id, datos, usuario);
  }

  @Delete('servicios/:itemId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Quita un servicio del borrador.',
    description: 'Errores: 404 NO_ENCONTRADO; 409 SOLICITUD_NO_EDITABLE.',
  })
  @ApiNoContentResponse({ description: 'Servicio quitado.' })
  @ApiErrores(400, 401, 404, 409)
  quitarServicio(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    return this.servicio.quitarServicio(id, itemId, usuario);
  }
}
