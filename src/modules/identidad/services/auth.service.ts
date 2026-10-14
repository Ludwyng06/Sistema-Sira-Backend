import { Injectable, Logger } from '@nestjs/common';
import { argon2id, hash } from 'argon2';
import { Rol, TipoSolicitante } from '../../../generated/prisma/enums.js';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ErrorDominio, noImplementado } from '../../../shared/errores/error-dominio.js';
import { ParametroService } from '../../../shared/parametros/parametro.service.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { IngresarDto } from '../dto/ingresar.dto.js';
import type { RecuperarDto } from '../dto/recuperar.dto.js';
import type { ReenviarCodigoDto } from '../dto/reenviar-codigo.dto.js';
import type { RegistroDto } from '../dto/registro.dto.js';
import type { RestablecerDto } from '../dto/restablecer.dto.js';
import type { MensajeDto, RegistroRespuestaDto, SesionDto, UsuarioSesionDto } from '../dto/respuestas.js';
import type { VerificarCorreoDto } from '../dto/verificar-correo.dto.js';
import { CodigoVerificacionService } from './codigo-verificacion.service.js';

export interface ContextoRegistro {
  ip: string;
  userAgent: string | null;
}

const MENSAJE_CODIGO_ENVIADO = 'Te enviamos un código de verificación a tu correo.';
const MENSAJE_CODIGO_NO_ENVIADO =
  'Tu cuenta fue creada, pero no pudimos enviarte el código. Usa «Reenviar código» en unos minutos.';

/** Registro, verificación y reenvío implementados; el resto del contrato responde 501. */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametroService,
    private readonly codigos: CodigoVerificacionService,
  ) {}

  async registrar(datos: RegistroDto, contexto: ContextoRegistro): Promise<RegistroRespuestaDto> {
    const versionVigente = await this.parametros.obtenerTexto('version_politica_datos');
    if (datos.versionPolitica !== versionVigente) {
      throw new ErrorDominio(
        'POLITICA_DESACTUALIZADA',
        'La política de tratamiento de datos cambió. Recarga la página y acéptala de nuevo.',
        422,
      );
    }

    const dominios = await this.parametros.obtenerListaTexto('dominios_institucionales');
    const esInstitucional = this.esCorreoInstitucional(datos.correo, dominios);
    const tipo = this.resolverTipo(datos.tipo, esInstitucional);

    let dependenciaId: string | null = null;
    if (tipo === TipoSolicitante.INTERNO && datos.dependenciaId) {
      const dependencia = await this.prisma.dependencia.findFirst({
        where: { id: datos.dependenciaId, activa: true },
        select: { id: true },
      });
      if (!dependencia) {
        throw new ErrorDominio('DEPENDENCIA_NO_ENCONTRADA', 'La dependencia seleccionada no existe.', 404);
      }
      dependenciaId = dependencia.id;
    }

    await this.verificarDuplicados(datos);

    const hashContrasena = await hash(datos.contrasena, { type: argon2id });

    const usuario = await this.prisma.$transaction(async (tx) => {
      const creado = await tx.usuario.create({
        data: { correo: datos.correo, hashContrasena, esInstitucional, correoVerificado: false },
        select: { id: true, correo: true },
      });
      await tx.usuarioRol.create({
        data: { usuarioId: creado.id, rol: Rol.SOLICITANTE, dependenciaId: null },
      });
      await tx.solicitante.create({
        data: {
          usuarioId: creado.id,
          tipo,
          nombres: datos.nombres,
          apellidos: datos.apellidos ?? null,
          razonSocial: datos.razonSocial ?? null,
          tipoDocumento: datos.tipoDocumento,
          numeroDocumento: datos.numeroDocumento,
          representanteLegal: datos.representanteLegal ?? null,
          telefono: datos.telefono,
          direccion: datos.direccion ?? null,
          municipio: datos.municipio ?? null,
          dependenciaId,
        },
      });
      await tx.consentimientoDatos.create({
        data: {
          usuarioId: creado.id,
          versionPolitica: datos.versionPolitica,
          ip: contexto.ip,
          userAgent: contexto.userAgent,
        },
      });
      return creado;
    });

    let mensaje = MENSAJE_CODIGO_ENVIADO;
    try {
      await this.codigos.emitirVerificacionCorreo({
        id: usuario.id,
        correo: usuario.correo,
        nombres: datos.nombres,
      });
    } catch (error) {
      this.logger.error(
        `La cuenta ${usuario.id} se creó, pero no se pudo enviar el código de verificación.`,
        error instanceof Error ? error.stack : String(error),
      );
      mensaje = MENSAJE_CODIGO_NO_ENVIADO;
    }

    return {
      id: usuario.id,
      correo: usuario.correo,
      esInstitucional,
      correoVerificado: false,
      mensaje,
    };
  }

  verificarCorreo(datos: VerificarCorreoDto): Promise<MensajeDto> {
    return this.codigos.verificarCorreo(datos);
  }

  reenviarCodigo(datos: ReenviarCodigoDto): Promise<MensajeDto> {
    return this.codigos.reenviarVerificacionCorreo(datos);
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

  private esCorreoInstitucional(correo: string, dominios: string[]): boolean {
    const dominio = correo.slice(correo.lastIndexOf('@') + 1).toLowerCase();
    return dominios
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d.length > 0)
      .some((d) => dominio === d || dominio.endsWith(`.${d}`));
  }

  private resolverTipo(enviado: TipoSolicitante, esInstitucional: boolean): TipoSolicitante {
    if (esInstitucional) return TipoSolicitante.INTERNO;
    if (enviado === TipoSolicitante.INTERNO) {
      throw new ErrorDominio(
        'TIPO_SOLICITANTE_INVALIDO',
        'Solo las cuentas con correo institucional pueden registrarse como internas.',
        422,
      );
    }
    return enviado;
  }

  private async verificarDuplicados(datos: RegistroDto): Promise<void> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { correo: datos.correo },
      select: { id: true },
    });
    if (usuario) {
      throw new ErrorDominio(
        'CORREO_REGISTRADO',
        'Ya existe una cuenta con este correo. Ingresa o recupera tu contraseña.',
        409,
      );
    }
    const solicitante = await this.prisma.solicitante.findUnique({
      where: {
        tipoDocumento_numeroDocumento: {
          tipoDocumento: datos.tipoDocumento,
          numeroDocumento: datos.numeroDocumento,
        },
      },
      select: { id: true },
    });
    if (solicitante) {
      throw new ErrorDominio(
        'DOCUMENTO_REGISTRADO',
        'Ya existe una cuenta con este documento de identidad.',
        409,
      );
    }
  }
}
