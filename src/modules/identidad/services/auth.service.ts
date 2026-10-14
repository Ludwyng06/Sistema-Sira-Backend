import { Injectable } from '@nestjs/common';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { noImplementado } from '../../../shared/errores/error-dominio.js';
import type { IngresarDto } from '../dto/ingresar.dto.js';
import type { RecuperarDto } from '../dto/recuperar.dto.js';
import type { ReenviarCodigoDto } from '../dto/reenviar-codigo.dto.js';
import type { RegistroDto } from '../dto/registro.dto.js';
import type { RestablecerDto } from '../dto/restablecer.dto.js';
import type { MensajeDto, RegistroRespuestaDto, SesionDto, UsuarioSesionDto } from '../dto/respuestas.js';
import type { VerificarCorreoDto } from '../dto/verificar-correo.dto.js';

/** Contrato publicado: la lógica real se implementa en una fase posterior. */
@Injectable()
export class AuthService {
  registrar(_datos: RegistroDto): Promise<RegistroRespuestaDto> {
    return Promise.reject(noImplementado('El registro de usuarios'));
  }

  verificarCorreo(_datos: VerificarCorreoDto): Promise<MensajeDto> {
    return Promise.reject(noImplementado('La verificación del correo'));
  }

  reenviarCodigo(_datos: ReenviarCodigoDto): Promise<MensajeDto> {
    return Promise.reject(noImplementado('El reenvío del código de verificación'));
  }

  ingresar(_datos: IngresarDto): Promise<SesionDto> {
    return Promise.reject(noImplementado('El ingreso al sistema'));
  }

  refrescar(): Promise<SesionDto> {
    return Promise.reject(noImplementado('El refresco de la sesión'));
  }

  salir(_usuario: UsuarioAutenticado): Promise<void> {
    return Promise.reject(noImplementado('El cierre de sesión'));
  }

  recuperar(_datos: RecuperarDto): Promise<MensajeDto> {
    return Promise.reject(noImplementado('La recuperación de contraseña'));
  }

  restablecer(_datos: RestablecerDto): Promise<MensajeDto> {
    return Promise.reject(noImplementado('El restablecimiento de contraseña'));
  }

  yo(_usuario: UsuarioAutenticado): Promise<UsuarioSesionDto> {
    return Promise.reject(noImplementado('La consulta del perfil de la sesión'));
  }
}
