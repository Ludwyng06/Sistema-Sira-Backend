import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Publico } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import { EpaycoAdapter } from '../adaptadores/epayco.adapter.js';

@ApiTags('Pagos')
@Controller('pagos/checkout/epayco')
export class EpaycoCheckoutController {
  constructor(private readonly epayco: EpaycoAdapter) {}

  @Get()
  @Publico()
  @ApiProduces('text/html')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @ApiOperation({ summary: 'Abre la sesión de ePayco con su SDK oficial.',
    description: 'Página puente pública protegida por token temporal firmado por SIRA; no confirma pagos. Errores: 401 CHECKOUT_INVALIDO; 409 CHECKOUT_VENCIDO; 503 PASARELA_SIN_CONFIGURAR.' })
  @ApiOkResponse({ description: 'Página de apertura de Smart Checkout.', schema: { type: 'string' } })
  @ApiErrores(401, 409, 503)
  pagina(@Query('token') token: string | undefined, @Res({ passthrough: true }) respuesta: Response): string {
    if (typeof token !== 'string' || token.length > 4000) throw new ErrorDominio('CHECKOUT_INVALIDO', 'El enlace de pago no es válido.', 401);
    const pagina = this.epayco.paginaCheckout(token);
    respuesta.setHeader('Content-Type', 'text/html; charset=utf-8');
    respuesta.setHeader('Content-Security-Policy', pagina.csp);
    return pagina.html;
  }
}
