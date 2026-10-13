import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
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
import { Publico, UsuarioActual, type UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import { IngresarDto } from '../dto/ingresar.dto.js';
import { RecuperarDto } from '../dto/recuperar.dto.js';
import { ReenviarCodigoDto } from '../dto/reenviar-codigo.dto.js';
import { RegistroDto } from '../dto/registro.dto.js';
import { RestablecerDto } from '../dto/restablecer.dto.js';
import { MensajeDto, RegistroRespuestaDto, SesionDto, UsuarioSesionDto } from '../dto/respuestas.js';
import { VerificarCorreoDto } from '../dto/verificar-correo.dto.js';
import { AuthService } from '../services/auth.service.js';

const LIMITE_CINCO_POR_MINUTO = { default: { limit: 5, ttl: 60_000 } };

@ApiTags('Identidad')
@Controller('auth')
export class AuthController {
  constructor(private readonly servicio: AuthService) {}

  @Publico()
  @Post('registro')
  @ApiOperation({
    summary: 'Registra una cuenta de solicitante.',
    description:
      'Exige aceptar la política de datos. Si el dominio del correo es institucional, el servidor asigna ' +
      'el perfil INTERNO sin importar el tipo enviado. Se envía un código de 6 dígitos al correo, ' +
      'válido 15 minutos y con máximo 5 intentos. Sin correo verificado no se pueden enviar solicitudes.',
  })
  @ApiCreatedResponse({ type: RegistroRespuestaDto })
  @ApiErrores(400, 409, 429, 501)
  registrar(@Body() datos: RegistroDto): Promise<RegistroRespuestaDto> {
    return this.servicio.registrar(datos);
  }

  @Publico()
  @Post('verificar-correo')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Verifica el correo con el código recibido.',
    description:
      'El código tiene 6 dígitos, es válido 15 minutos y admite máximo 5 intentos. ' +
      'Sin correo verificado no se pueden enviar solicitudes.',
  })
  @ApiOkResponse({ type: MensajeDto })
  @ApiErrores(400, 422, 429, 501)
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
      'Límite de 5 peticiones por minuto. El nuevo código tiene 6 dígitos y es válido 15 minutos.',
  })
  @ApiOkResponse({ type: MensajeDto })
  @ApiErrores(400, 429, 501)
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
      'Límite de 5 peticiones por minuto.',
  })
  @ApiOkResponse({ type: SesionDto })
  @ApiErrores(400, 401, 429, 501)
  ingresar(@Body() datos: IngresarDto): Promise<SesionDto> {
    return this.servicio.ingresar(datos);
  }

  @Publico()
  @ApiCookieAuth('sira_refresh')
  @Post('refrescar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Renueva la sesión con la cookie de refresco.',
    description:
      "Lee la cookie httpOnly 'sira_refresh', la rota (el token anterior queda revocado) y devuelve un " +
      'nuevo accessToken. Si llega un token ya revocado se cierran todas las sesiones de esa familia.',
  })
  @ApiOkResponse({ type: SesionDto })
  @ApiErrores(401, 429, 501)
  refrescar(): Promise<SesionDto> {
    return this.servicio.refrescar();
  }

  @ApiBearerAuth()
  @Post('salir')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Cierra la sesión actual.',
    description: "Revoca el token de refresco y limpia la cookie 'sira_refresh'.",
  })
  @ApiNoContentResponse({ description: 'Sesión cerrada.' })
  @ApiErrores(401, 501)
  salir(@UsuarioActual() usuario: UsuarioAutenticado): Promise<void> {
    return this.servicio.salir(usuario);
  }

  @Publico()
  @Post('recuperar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Solicita el enlace de recuperación de contraseña.',
    description:
      'Responde siempre lo mismo, exista o no el correo. El enlace es de un solo uso y vence a los 30 minutos.',
  })
  @ApiOkResponse({ type: MensajeDto })
  @ApiErrores(400, 429, 501)
  recuperar(@Body() datos: RecuperarDto): Promise<MensajeDto> {
    return this.servicio.recuperar(datos);
  }

  @Publico()
  @Post('restablecer')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Define una nueva contraseña con el token del enlace.',
    description:
      'El token es de un solo uso y vence a los 30 minutos. La contraseña nueva exige mínimo 10 caracteres.',
  })
  @ApiOkResponse({ type: MensajeDto })
  @ApiErrores(400, 422, 429, 501)
  restablecer(@Body() datos: RestablecerDto): Promise<MensajeDto> {
    return this.servicio.restablecer(datos);
  }

  @ApiBearerAuth()
  @Get('yo')
  @ApiOperation({
    summary: 'Devuelve el usuario de la sesión actual.',
    description: 'Incluye perfil, roles y si el correo está verificado (sin verificar no se envían solicitudes).',
  })
  @ApiOkResponse({ type: UsuarioSesionDto })
  @ApiErrores(401, 501)
  yo(@UsuarioActual() usuario: UsuarioAutenticado): Promise<UsuarioSesionDto> {
    return this.servicio.yo(usuario);
  }
}
