import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Roles, UsuarioActual, type UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import {
  CrearOrdenPagoDto,
  FiltrosOrdenesDto,
  OrdenPagoDto,
  PagoTardioDto,
  PaginaOrdenesDto,
  RegistrarPagoTardioDto,
  SubirSoporteDto,
  VerificacionDto,
  VerificarPagoDto,
} from '../dto/pago.dto.js';
import { PagosService, type SoporteSubido, TAMANO_MAXIMO_SOPORTE } from '../services/pagos.service.js';

@ApiTags('Pagos')
@ApiBearerAuth()
@Controller('pagos/ordenes')
export class PagosController {
  constructor(private readonly servicio: PagosService) {}

  @Post()
  @ApiOperation({
    summary: 'Genera la orden de pago por consignación de una solicitud cotizada (UC-03).',
    description:
      'Crea la orden con su referencia OP- y devuelve la cuenta de recaudo. El valor es el total de la ' +
      'cotización más el depósito de garantía. Si ya hay una orden pendiente, la devuelve. La solicitud pasa ' +
      'a PAGO_PENDIENTE.\n\n' +
      'Errores: 404 NO_ENCONTRADO; 409 ORDEN_NO_PERMITIDA o COTIZACION_VENCIDA; 422 SOLICITUD_EXENTA.',
  })
  @ApiCreatedResponse({ type: OrdenPagoDto })
  @ApiErrores(400, 401, 404, 409, 422)
  crear(
    @Body() datos: CrearOrdenPagoDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('x-correlation-id') correlacionId: string | undefined,
  ): Promise<OrdenPagoDto> {
    return this.servicio.crearOrden(datos.solicitudId, usuario, {
      ip,
      userAgent: userAgent ?? null,
      correlacionId: correlacionId ?? null,
    });
  }

  @Post(':id/soporte')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('archivo', { limits: { fileSize: TAMANO_MAXIMO_SOPORTE, files: 1 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SubirSoporteDto })
  @ApiOperation({
    summary: 'Carga el comprobante de la consignación.',
    description:
      'Solo el dueño de la solicitud. Acepta PDF, PNG o JPG de hasta 10 MB y pasa la orden a ' +
      'EN_VERIFICACION (una orden en verificación no vence).\n\n' +
      'Errores: 404 NO_ENCONTRADO; 409 ORDEN_NO_PERMITIDA u ORDEN_VENCIDA; 413 si supera 10 MB; ' +
      '422 ARCHIVO_REQUERIDO o ARCHIVO_NO_PERMITIDO.',
  })
  @ApiOkResponse({ type: OrdenPagoDto })
  @ApiErrores(400, 401, 404, 409, 422)
  cargarSoporte(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() archivo: SoporteSubido | undefined,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('x-correlation-id') correlacionId: string | undefined,
  ): Promise<OrdenPagoDto> {
    return this.servicio.cargarSoporte(id, archivo, usuario, {
      ip,
      userAgent: userAgent ?? null,
      correlacionId: correlacionId ?? null,
    });
  }

  @Post(':id/verificacion')
  @HttpCode(200)
  @Roles('TESORERIA')
  @ApiOperation({
    summary: 'Tesorería aprueba o rechaza el pago (UC-03).',
    description:
      'Aprobar confirma la solicitud y sus franjas (RN-11). Rechazar exige observación; la solicitud sigue ' +
      'en PAGO_PENDIENTE para que el solicitante genere una nueva orden.\n\n' +
      'Errores: 404 NO_ENCONTRADO; 409 ORDEN_NO_VERIFICABLE; 422 MOTIVO_REQUERIDO.',
  })
  @ApiOkResponse({ type: VerificacionDto })
  @ApiErrores(400, 401, 403, 404, 409, 422)
  verificar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() datos: VerificarPagoDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('x-correlation-id') correlacionId: string | undefined,
  ): Promise<VerificacionDto> {
    return this.servicio.verificar(id, datos, usuario, {
      ip,
      userAgent: userAgent ?? null,
      correlacionId: correlacionId ?? null,
    });
  }

  @Post(':id/pago-tardio')
  @HttpCode(200)
  @Roles('TESORERIA')
  @ApiOperation({
    summary: 'Registra un pago recibido después de vencer la orden (RN-02d).',
    description:
      'Solo sobre una orden vencida de una solicitud vencida. Si las franjas siguen libres se vuelven a ocupar ' +
      'y la solicitud se confirma; si no, el pago queda marcado para reembolso total y se avisa a tesorería y ' +
      'al solicitante.\n\nErrores: 404 NO_ENCONTRADO; 409 PAGO_TARDIO_NO_APLICA.',
  })
  @ApiOkResponse({ type: PagoTardioDto })
  @ApiErrores(400, 401, 403, 404, 409)
  pagoTardio(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() datos: RegistrarPagoTardioDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('x-correlation-id') correlacionId: string | undefined,
  ): Promise<PagoTardioDto> {
    return this.servicio.registrarPagoTardio(id, datos, usuario, {
      ip,
      userAgent: userAgent ?? null,
      correlacionId: correlacionId ?? null,
    });
  }

  @Get()
  @Roles('TESORERIA', 'AUDITOR')
  @ApiOperation({
    summary: 'Conciliación: lista las órdenes de pago.',
    description: 'Paginada, de la más reciente a la más antigua; filtra por estado.',
  })
  @ApiOkResponse({ type: PaginaOrdenesDto })
  @ApiErrores(400, 401, 403)
  listar(@Query() filtros: FiltrosOrdenesDto): Promise<PaginaOrdenesDto> {
    return this.servicio.listar(filtros);
  }

  @Get(':id/soporte')
  @ApiProduces('application/pdf', 'image/png', 'image/jpeg')
  @ApiOperation({
    summary: 'Descarga el comprobante de una orden.',
    description:
      'Su dueño, tesorería y auditoría. Cualquier otro usuario recibe 404.\n\nErrores: 404 NO_ENCONTRADO.',
  })
  @ApiOkResponse({ description: 'Contenido del comprobante.' })
  @ApiErrores(400, 401, 404)
  async descargarSoporte(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<StreamableFile> {
    const archivo = await this.servicio.descargarSoporte(id, usuario);
    return new StreamableFile(archivo.contenido, {
      type: archivo.tipoMime,
      disposition: `attachment; filename="${archivo.nombre}"`,
    });
  }
}
