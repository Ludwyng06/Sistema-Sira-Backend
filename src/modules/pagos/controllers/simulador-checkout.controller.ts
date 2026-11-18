import { Body, Controller, Get, Header, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Publico } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import { SimuladorAdapter } from '../adaptadores/simulador.adapter.js';

export class ElegirSimulacionDto {
  @ApiProperty() @IsString() @MaxLength(4000) token!: string;
  @ApiProperty({ enum: ['APROBADA', 'RECHAZADA', 'PENDIENTE'] }) @IsIn(['APROBADA', 'RECHAZADA', 'PENDIENTE']) estado!: string;
}
@ApiTags('Pagos')
@Controller('pagos/checkout/simulador')
export class SimuladorCheckoutController {
  constructor(private readonly simulador: SimuladorAdapter) {}
  @Get() @Publico() @Header('Cache-Control', 'no-store') @ApiProduces('text/html')
  @ApiOperation({ summary: 'Abre el simulador local de pago.', description: 'Solo fuera de producción, con token temporal. Errores: 401 CHECKOUT_INVALIDO; 404 NO_ENCONTRADO; 409 CHECKOUT_VENCIDO; 503 SIMULADOR_DESACTIVADO.' })
  @ApiOkResponse({ schema: { type: 'string' }, description: 'Formulario de simulación.' }) @ApiErrores(401, 404, 409, 503)
  async pagina(@Query('token') token: string | undefined, @Res({ passthrough: true }) respuesta: Response): Promise<string> {
    if (typeof token !== 'string' || token.length > 4000) throw new ErrorDominio('CHECKOUT_INVALIDO', 'Enlace inválido.', 401);
    const html = await this.simulador.pagina(token); respuesta.setHeader('Content-Type', 'text/html; charset=utf-8'); return html;
  }
  @Post() @Publico() @ApiConsumes('application/x-www-form-urlencoded') @ApiBody({ type: ElegirSimulacionDto })
  @ApiOperation({ summary: 'Envía un evento firmado al propio webhook y vuelve al portal.', description: 'No modifica directamente la orden. Errores: 401 CHECKOUT_INVALIDO; 404 NO_ENCONTRADO; 409 TRANSACCION_RESUELTA; 422 ESTADO_INVALIDO; 503 WEBHOOK_NO_RECIBIDO.' })
  @ApiResponse({ status: 303, description: 'Redirección al retorno firmado.' }) @ApiErrores(400, 401, 404, 409, 422, 503)
  async elegir(@Body() datos: ElegirSimulacionDto, @Res() respuesta: Response): Promise<void> {
    respuesta.redirect(303, await this.simulador.elegir(datos.token, datos.estado));
  }
}
