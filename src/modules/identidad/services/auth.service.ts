import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';
import { Rol, TipoSolicitante } from '../../../generated/prisma/enums.js';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import { ParametroService } from '../../../shared/parametros/parametro.service.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { IngresarDto } from '../dto/ingresar.dto.js';
import type { RecuperarDto } from '../dto/recuperar.dto.js';
import type { ReenviarCodigoDto } from '../dto/reenviar-codigo.dto.js';
import type { RegistroDto } from '../dto/registro.dto.js';
import type { RestablecerDto } from '../dto/restablecer.dto.js';
import type { MensajeDto, RegistroRespuestaDto, UsuarioSesionDto } from '../dto/respuestas.js';
import type { VerificarCorreoDto } from '../dto/verificar-correo.dto.js';
import { CodigoVerificacionService } from './codigo-verificacion.service.js';
import { RecuperacionService } from './recuperacion.service.js';
import { type ContextoSesion, type SesionEmitida, SesionService } from './sesion.service.js';

export interface ContextoRegistro {
  ip: string;
  userAgent: string | null;
}

export interface ContextoIngreso extends ContextoSesion {
  correlacionId: string | null;
}

const FORMATO_HORA = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Bogota',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function credencialesInvalidas(): ErrorDominio {
  return new ErrorDominio('CREDENCIALES_INVALIDAS', 'El correo o la contraseña no son correctos.', 401);
}

function cuentaBloqueada(bloqueadaHasta: Date): ErrorDominio {
  return new ErrorDominio(
    'CUENTA_BLOQUEADA',
    `Tu cuenta está bloqueada por seguridad. Intenta de nuevo a las ${FORMATO_HORA.format(bloqueadaHasta)}.`,
    429,
    { bloqueadaHasta: bloqueadaHasta.toISOString() },
  );
}

const MENSAJE_CODIGO_ENVIADO = 'Te enviamos un código de verificación a tu correo.';
const MENSAJE_CODIGO_NO_ENVIADO =
  'Tu cuenta fue creada, pero no pudimos enviarte el código. Usa «Reenviar código» en unos minutos.';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private hashRelleno = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametroService,
    private readonly codigos: CodigoVerificacionService,
    private readonly recuperacion: RecuperacionService,
    private readonly sesiones: SesionService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.hashRelleno = await hash('relleno-sin-cuenta-sira', { type: argon2id });
  }

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

  async ingresar(datos: IngresarDto, contexto: ContextoIngreso): Promise<SesionEmitida> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { correo: datos.correo },
      select: { id: true, hashContrasena: true, activo: true, bloqueadoHasta: true },
    });
    if (!usuario?.activo) {
      await this.compararRelleno(datos.contrasena);
      throw credencialesInvalidas();
    }

    const ahora = new Date();
    if (usuario.bloqueadoHasta && usuario.bloqueadoHasta > ahora) {
      throw cuentaBloqueada(usuario.bloqueadoHasta);
    }

    if (!(await verify(usuario.hashContrasena, datos.contrasena))) {
      await this.registrarFallo(usuario.id, contexto);
      throw credencialesInvalidas();
    }

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { intentosFallidos: 0, bloqueadoHasta: null, ultimoIngresoEn: ahora },
    });
    return this.sesiones.iniciar(usuario.id, contexto);
  }

  refrescar(refreshToken: string | null, contexto: ContextoSesion): Promise<SesionEmitida> {
    if (!refreshToken) {
      return Promise.reject(
        new ErrorDominio('SESION_INVALIDA', 'Tu sesión terminó. Ingresa de nuevo.', 401),
      );
    }
    return this.sesiones.rotar(refreshToken, contexto);
  }

  salir(refreshToken: string | null): Promise<void> {
    return this.sesiones.cerrar(refreshToken);
  }

  recuperar(datos: RecuperarDto): Promise<MensajeDto> {
    return this.recuperacion.solicitar(datos);
  }

  restablecer(datos: RestablecerDto): Promise<MensajeDto> {
    return this.recuperacion.restablecer(datos);
  }

  yo(usuario: UsuarioAutenticado): Promise<UsuarioSesionDto> {
    return this.sesiones.datosUsuario(usuario.id);
  }

  private async compararRelleno(contrasena: string): Promise<void> {
    if (!this.hashRelleno) await this.onModuleInit();
    await verify(this.hashRelleno, contrasena);
  }

  private async registrarFallo(usuarioId: string, contexto: ContextoIngreso): Promise<void> {
    const [maximo, minutos] = await Promise.all([
      this.parametros.obtenerNumero('max_intentos_ingreso'),
      this.parametros.obtenerNumero('minutos_bloqueo_ingreso'),
    ]);
    const { intentosFallidos } = await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { intentosFallidos: { increment: 1 } },
      select: { intentosFallidos: true },
    });
    if (intentosFallidos < maximo) return;

    const bloqueadoHasta = new Date(Date.now() + minutos * 60_000);
    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: usuarioId },
        data: { bloqueadoHasta, intentosFallidos: 0 },
      });
      await tx.bitacora.create({
        data: {
          usuarioId,
          accion: 'CUENTA_BLOQUEADA',
          entidad: 'Usuario',
          entidadId: usuarioId,
          ip: contexto.ip,
          userAgent: contexto.userAgent,
          correlacionId: contexto.correlacionId,
          datosDespues: { bloqueadoHasta: bloqueadoHasta.toISOString() },
        },
      });
    });
    throw cuentaBloqueada(bloqueadoHasta);
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
