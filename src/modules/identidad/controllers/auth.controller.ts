import { Body, Controller, Get, Headers, HttpCode, Ip, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Publico, UsuarioActual, type UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import { IngresarDto } from '../dto/ingresar.dto.js';
import { RecuperarDto } from '../dto/recuperar.dto.js';
import { ReenviarCodigoDto } from '../dto/reenviar-codigo.dto.js';
import { RegistroDto } from '../dto/registro.dto.js';
import { RestablecerDto } from '../dto/restablecer.dto.js';
import { MensajeDto, RegistroRespuestaDto, SesionDto, UsuarioSesionDto } from '../dto/respuestas.js';
import { VerificarCorreoDto } from '../dto/verificar-correo.dto.js';
import { AuthService } from '../services/auth.service.js';
import type { SesionEmitida } from '../services/sesion.service.js';
import {
  leerCookieRefresco,
  NOMBRE_COOKIE_REFRESCO,
  opcionesCookieRefresco,
  opcionesLimpiarCookieRefresco,
} from '../sesion/cookie-refresco.js';

const LIMITE_CINCO_POR_MINUTO = { default: { limit: 5, ttl: 60_000 } };

@ApiTags('Identidad')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly servicio: AuthService,
    private readonly config: ConfigService,
  ) {}

  private get produccion(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  private entregarSesion(res: Response, sesion: SesionEmitida): SesionDto {
    res.cookie(
      NOMBRE_COOKIE_REFRESCO,
      sesion.refreshToken,
      opcionesCookieRefresco(this.produccion, sesion.refreshExpiraEn),
    );
    return { accessToken: sesion.accessToken, expiraEn: sesion.expiraEn, usuario: sesion.usuario };
  }

  @Publico()
  @Post('registro')
  @ApiOperation({
    summary: 'Registra una cuenta de solicitante.',
    description:
      'Exige aceptar la política de datos. Si el dominio del correo es institucional, el servidor asigna ' +
      'el perfil INTERNO sin importar el tipo enviado. Se envía un código de 6 dígitos al correo, ' +
      'válido 15 minutos y con máximo 5 intentos. Sin correo verificado no se pueden enviar solicitudes.\n\n' +
      'Errores: 404 DEPENDENCIA_NO_ENCONTRADA; 409 CORREO_REGISTRADO o DOCUMENTO_REGISTRADO; ' +
      '422 POLITICA_DESACTUALIZADA o TIPO_SOLICITANTE_INVALIDO.',
  })
  @ApiCreatedResponse({ type: RegistroRespuestaDto })
  @ApiErrores(400, 404, 409, 422, 429)
  registrar(
    @Body() datos: RegistroDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
  ): Promise<RegistroRespuestaDto> {
    return this.servicio.registrar(datos, { ip, userAgent: userAgent ?? null });
  }

  @Publico()
  @Post('verificar-correo')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Verifica el correo con el código recibido.',
    description:
      'El código tiene 6 dígitos, es válido 15 minutos y admite máximo 5 intentos. ' +
      'Sin correo verificado no se pueden enviar solicitudes.\n\n' +
      'Errores: 422 CODIGO_INVALIDO, CODIGO_VENCIDO o CODIGO_AGOTADO.',
  })
  @ApiOkResponse({ type: MensajeDto })
  @ApiErrores(400, 422, 429)
  verificarCorreo(@Body() datos: VerificarCorreoDto): Promise<MensajeDto> {
    return this.servicio.verificarCorreo(datos);
  }

  @Publico()
  @Throttle(LIMITE_CINCO_POR_MINUTO)
  @Post('reenviar-codigo')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reenvía el código de verificación.',
    description:
      'Límite de 5 peticiones por minuto. El nuevo código tiene 6 dígitos y es válido 15 minutos.\n\n' +
      'Errores: 429 CODIGO_RECIENTE (o límite de peticiones por IP); 503 CORREO_NO_ENVIADO.',
  })
  @ApiOkResponse({ type: MensajeDto })
  @ApiErrores(400, 429, 503)
  reenviarCodigo(@Body() datos: ReenviarCodigoDto): Promise<MensajeDto> {
    return this.servicio.reenviarCodigo(datos);
  }

  @Publico()
  @Throttle(LIMITE_CINCO_POR_MINUTO)
  @Post('ingresar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Inicia sesión con correo y contraseña.',
    description:
      'Devuelve el accessToken (JWT, 15 minutos) en el cuerpo y el token de refresco (7 días) en la cookie ' +
      "httpOnly 'sira_refresh'. Tras 5 intentos fallidos la cuenta se bloquea 15 minutos. " +
      'Límite de 5 peticiones por minuto. El correo sin verificar puede ingresar, pero no enviar solicitudes.\n\n' +
      'Errores: 401 CREDENCIALES_INVALIDAS; 429 CUENTA_BLOQUEADA (o límite de peticiones por IP).',
  })
  @ApiOkResponse({ type: SesionDto })
  @ApiErrores(400, 401, 429)
  async ingresar(
    @Body() datos: IngresarDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('x-correlation-id') correlacionId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SesionDto> {
    const sesion = await this.servicio.ingresar(datos, {
      ip,
      userAgent: userAgent ?? null,
      correlacionId: correlacionId ?? null,
    });
    return this.entregarSesion(res, sesion);
  }

  @Publico()
  @ApiCookieAuth('sira_refresh')
  @Post('refrescar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Renueva la sesión con la cookie de refresco.',
    description:
      "Lee la cookie httpOnly 'sira_refresh', la rota (el token anterior queda revocado) y devuelve un " +
      'nuevo accessToken. Si llega un token ya revocado se cierran todas las sesiones de esa familia.\n\n' +
      'Errores: 401 SESION_INVALIDA o SESION_REVOCADA (la cookie se limpia); 429 por límite de peticiones.',
  })
  @ApiOkResponse({ type: SesionDto })
  @ApiErrores(401, 429)
  async refrescar(
    @Req() req: Request,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SesionDto> {
    try {
      const sesion = await this.servicio.refrescar(leerCookieRefresco(req.headers.cookie), {
        ip,
        userAgent: userAgent ?? null,
      });
      return this.entregarSesion(res, sesion);
    } catch (error) {
      if (
        error instanceof ErrorDominio &&
        (error.codigo === 'SESION_INVALIDA' || error.codigo === 'SESION_REVOCADA')
      ) {
        res.clearCookie(NOMBRE_COOKIE_REFRESCO, opcionesLimpiarCookieRefresco(this.produccion));
      }
      throw error;
    }
  }

  @ApiBearerAuth()
  @Post('salir')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Cierra la sesión actual.',
    description:
      "Revoca el token de refresco y limpia la cookie 'sira_refresh'. Responde 204 aunque no haya cookie.\n\n" +
      'Errores: 401 si no hay un access token válido.',
  })
  @ApiNoContentResponse({ description: 'Sesión cerrada.' })
  @ApiErrores(401)
  async salir(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.servicio.salir(leerCookieRefresco(req.headers.cookie));
    res.clearCookie(NOMBRE_COOKIE_REFRESCO, opcionesLimpiarCookieRefresco(this.produccion));
  }

  @Publico()
  @Throttle(LIMITE_CINCO_POR_MINUTO)
  @Post('recuperar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Solicita el enlace de recuperación de contraseña.',
    description:
      'Responde siempre lo mismo, exista o no el correo. El enlace es de un solo uso y vence a los 30 minutos.\n\n' +
      'Errores: 400 por datos inválidos; 429 por límite de peticiones por IP.',
  })
  @ApiOkResponse({ type: MensajeDto })
  @ApiErrores(400, 429)
  recuperar(@Body() datos: RecuperarDto): Promise<MensajeDto> {
    return this.servicio.recuperar(datos);
  }

  @Publico()
  @Post('restablecer')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Define una nueva contraseña con el token del enlace.',
    description:
      'El token es de un solo uso y vence a los 30 minutos. La contraseña nueva exige mínimo 10 caracteres.\n\n' +
      'Errores: 422 ENLACE_INVALIDO; 429 por límite de peticiones por IP.',
  })
  @ApiOkResponse({ type: MensajeDto })
  @ApiErrores(400, 422, 429)
  restablecer(@Body() datos: RestablecerDto): Promise<MensajeDto> {
    return this.servicio.restablecer(datos);
  }

  @ApiBearerAuth()
  @Get('yo')
  @ApiOperation({
    summary: 'Devuelve el usuario de la sesión actual.',
    description:
      'Incluye perfil, roles y si el correo está verificado (sin verificar no se envían solicitudes).\n\n' +
      'Errores: 401 sin access token o SESION_INVALIDA.',
  })
  @ApiOkResponse({ type: UsuarioSesionDto })
  @ApiErrores(401)
  yo(@UsuarioActual() usuario: UsuarioAutenticado): Promise<UsuarioSesionDto> {
    return this.servicio.yo(usuario);
  }
}
