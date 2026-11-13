import { Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Publico, UsuarioActual, type UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import { CheckoutPasarelaDto, EstadoPagoDto, EventoRecibidoDto } from '../dto/pasarela.dto.js';
import { PasarelaService } from '../services/pasarela.service.js';

@ApiTags('Pagos')
@Controller('pagos')
export class PasarelaController {
  constructor(private readonly servicio: PasarelaService) {}

  @Post('ordenes/:id/pasarela')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Abre el checkout del proveedor de la orden, con reintento tras rechazo.',
    description: 'Sin cuerpo. Devuelve el checkout con retorno a FRONTEND_URL/pagos/retorno?orden=<id>, sin confirmar el pago. Solo el solicitante dueño; una orden rechazada o anulada vigente admite otro intento. Errores: 404 NO_ENCONTRADO; 409 SOLICITUD_EXENTA, ORDEN_NO_PERMITIDA o AMBIENTE_NO_COINCIDE; 501 INTEGRACION_NO_VERIFICADA para operaciones de proveedores aún sin contrato confirmado; 503 PASARELA_DESACTIVADA o PASARELA_SIN_CONFIGURAR.' })
  @ApiCreatedResponse({ type: CheckoutPasarelaDto })
  @ApiErrores(400, 401, 404, 409, 501, 503)
  iniciar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<CheckoutPasarelaDto> {
    return this.servicio.iniciar(id, usuario);
  }

  @Get('ordenes/:id/estado')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lee el estado local de la orden propia; el retorno nunca confirma el pago.',
    description: 'No modifica la orden ni consulta al proveedor. Solo el solicitante dueño. Errores: 404 NO_ENCONTRADO; 422 SOLICITUD_EXENTA.' })
  @ApiOkResponse({ type: EstadoPagoDto })
  @ApiErrores(400, 401, 404, 422)
  estado(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<EstadoPagoDto> {
    return this.servicio.estado(id, usuario);
  }

  @Post('webhooks/wompi')
  @Publico()
  @HttpCode(200)
  @ApiBody({ schema: { type: 'object', required: ['event', 'environment', 'data', 'signature', 'timestamp'],
    properties: {
      event: { type: 'string', enum: ['transaction.updated'] }, environment: { type: 'string', enum: ['test', 'prod'] },
      data: { type: 'object', additionalProperties: true },
      signature: { type: 'object', required: ['properties', 'checksum'], properties: {
        properties: { type: 'array', items: { type: 'string' } }, checksum: { type: 'string' },
      } }, timestamp: { type: 'integer' },
    },
  } })
  @ApiOperation({ summary: 'Valida la firma del cuerpo crudo y registra el evento idempotente para procesarlo en segundo plano.',
    description: 'Público, autenticado por firma Wompi. Acepta transaction.updated del WOMPI_AMBIENTE configurado. Conserva el cuerpo original y devuelve 200 sin llamadas externas. Errores: 400 CUERPO_CRUDO_REQUERIDO; 401 FIRMA_WEBHOOK_INVALIDA; 422 EVENTO_INVALIDO.' })
  @ApiOkResponse({ type: EventoRecibidoDto })
  @ApiErrores(400, 401, 422)
  recibir(
    @Req() peticion: RawBodyRequest<Request>,
    @Headers('x-event-checksum') checksum: string | undefined,
  ): Promise<EventoRecibidoDto> {
    if (!peticion.rawBody) throw new ErrorDominio('CUERPO_CRUDO_REQUERIDO', 'El evento requiere el cuerpo original.', 400);
    return this.servicio.recibir(peticion.rawBody.toString('utf8'), checksum ? { 'x-event-checksum': checksum } : {});
  }

  @Post('webhooks/:proveedor')
  @Publico()
  @HttpCode(200)
  @ApiConsumes('application/json', 'application/x-www-form-urlencoded')
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  @ApiOperation({ summary: 'Recibe el webhook firmado de una pasarela registrada.',
    description: 'Proveedores: wompi, epayco, bold o ecollect. Valida con el adaptador solicitado y verifica el proveedor de la orden antes de aplicar el evento. Acepta JSON o formulario ePayco; conserva cuerpo crudo. Errores: 400 CUERPO_CRUDO_REQUERIDO; 401 FIRMA_WEBHOOK_INVALIDA; 404 NO_ENCONTRADO; 422 EVENTO_INVALIDO.' })
  @ApiOkResponse({ type: EventoRecibidoDto })
  @ApiErrores(400, 401, 404, 422)
  recibirProveedor(@Param('proveedor') proveedor: string, @Req() peticion: RawBodyRequest<Request>): Promise<EventoRecibidoDto> {
    if (!peticion.rawBody) throw new ErrorDominio('CUERPO_CRUDO_REQUERIDO', 'El evento requiere el cuerpo original.', 400);
    const cabeceras: Record<string, string> = {};
    for (const [clave, valor] of Object.entries(peticion.headers)) if (typeof valor === 'string') cabeceras[clave.toLowerCase()] = valor;
    return this.servicio.recibir(peticion.rawBody.toString('utf8'), cabeceras, proveedor);
  }
}
