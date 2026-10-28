import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import { ParametroService } from '../../../shared/parametros/parametro.service.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { CORREO, type CorreoPort } from '../../notificaciones/correo/correo.port.js';
import { correoRecuperacion } from '../correos/recuperacion.plantilla.js';
import type { RecuperarDto } from '../dto/recuperar.dto.js';
import type { MensajeDto } from '../dto/respuestas.js';
import type { RestablecerDto } from '../dto/restablecer.dto.js';
import { SesionService } from './sesion.service.js';

const PROPOSITO = 'RECUPERAR_CONTRASENA';
const MENSAJE_SOLICITUD = 'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.';
const MENSAJE_RESTABLECIDO = 'Tu contraseña cambió. Ingresa con la nueva contraseña.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function enlaceInvalido(): ErrorDominio {
  return new ErrorDominio('ENLACE_INVALIDO', 'El enlace no es válido o ya venció. Solicita uno nuevo.', 422);
}

function sha256(texto: string): Buffer {
  return createHash('sha256').update(texto).digest();
}

@Injectable()
export class RecuperacionService {
  private readonly logger = new Logger(RecuperacionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametroService,
    private readonly sesiones: SesionService,
    private readonly config: ConfigService,
    @Inject(CORREO) private readonly correo: CorreoPort,
  ) {}

  async solicitar(datos: RecuperarDto): Promise<MensajeDto> {
    try {
      await this.emitirEnlace(datos.correo);
    } catch (error) {
      this.logger.error(
        'No se pudo procesar una solicitud de recuperación de contraseña.',
        error instanceof Error ? error.stack : String(error),
      );
    }
    return { mensaje: MENSAJE_SOLICITUD };
  }

  async restablecer(datos: RestablecerDto): Promise<MensajeDto> {
    const separador = datos.token.indexOf('.');
    if (separador <= 0 || separador === datos.token.length - 1) throw enlaceInvalido();
    const id = datos.token.slice(0, separador);
    const secreto = datos.token.slice(separador + 1);
    if (!UUID.test(id)) throw enlaceInvalido();

    const ahora = new Date();
    const registro = await this.prisma.codigoVerificacion.findFirst({
      where: { id, proposito: PROPOSITO, usadoEn: null, expiraEn: { gt: ahora } },
      select: { id: true, usuarioId: true, hashCodigo: true, usuario: { select: { activo: true } } },
    });
    if (!registro?.usuario.activo) throw enlaceInvalido();

    const esperado = Buffer.from(registro.hashCodigo, 'hex');
    const recibido = sha256(secreto);
    if (esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) throw enlaceInvalido();

    const hashContrasena = await argon2.hash(datos.contrasenaNueva, { type: argon2.argon2id });

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.codigoVerificacion.updateMany({
        where: { id: registro.id, usadoEn: null },
        data: { usadoEn: ahora },
      });
      if (count === 0) throw enlaceInvalido();
      await tx.usuario.update({
        where: { id: registro.usuarioId },
        data: { hashContrasena, intentosFallidos: 0, bloqueadoHasta: null, correoVerificado: true },
      });
      await this.sesiones.revocarTodas(registro.usuarioId, tx);
    });

    this.logger.log(`Contraseña restablecida para el usuario ${registro.usuarioId}.`);
    return { mensaje: MENSAJE_RESTABLECIDO };
  }

  private async emitirEnlace(correo: string): Promise<void> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { correo },
      select: { id: true, correo: true, activo: true, solicitante: { select: { nombres: true } } },
    });
    if (!usuario?.activo) return;

    const minutosVigencia = await this.parametros.obtenerNumero('minutos_vigencia_enlace_recuperacion');
    const secreto = randomBytes(32).toString('base64url');
    const ahora = new Date();
    const expiraEn = new Date(ahora.getTime() + minutosVigencia * 60_000);

    const creado = await this.prisma.$transaction(async (tx) => {
      await tx.codigoVerificacion.updateMany({
        where: { usuarioId: usuario.id, proposito: PROPOSITO, usadoEn: null, expiraEn: { gt: ahora } },
        data: { expiraEn: ahora },
      });
      return tx.codigoVerificacion.create({
        data: {
          usuarioId: usuario.id,
          proposito: PROPOSITO,
          hashCodigo: sha256(secreto).toString('hex'),
          expiraEn,
        },
        select: { id: true },
      });
    });

    const base = this.config.getOrThrow<string>('FRONTEND_URL').replace(/\/+$/, '');
    const token = encodeURIComponent(`${creado.id}.${secreto}`);
    const contenido = correoRecuperacion({
      nombres: usuario.solicitante?.nombres ?? usuario.correo,
      enlace: `${base}/restablecer?token=${token}`,
      minutosVigencia,
    });
    await this.correo.enviar({ para: usuario.correo, ...contenido });
    this.logger.log(`Enlace de recuperación emitido para el usuario ${usuario.id}.`);
  }
}
