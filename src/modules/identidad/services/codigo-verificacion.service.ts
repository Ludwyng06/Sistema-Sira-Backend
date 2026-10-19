import { Inject, Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomInt } from 'node:crypto';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import { ParametroService } from '../../../shared/parametros/parametro.service.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { CORREO, type CorreoPort } from '../../notificaciones/correo/correo.port.js';
import { correoCodigoVerificacion } from '../correos/codigo-verificacion.plantilla.js';
import type { ReenviarCodigoDto } from '../dto/reenviar-codigo.dto.js';
import type { MensajeDto } from '../dto/respuestas.js';
import type { VerificarCorreoDto } from '../dto/verificar-correo.dto.js';

const PROPOSITO = 'VERIFICAR_CORREO';
const MENSAJE_GENERICO_REENVIO = 'Si la cuenta existe y no está verificada, te enviamos un código nuevo.';
const MENSAJE_CODIGO_INVALIDO = 'El código no es válido. Revisa el correo o solicita uno nuevo.';

interface UsuarioParaCodigo {
  id: string;
  correo: string;
  nombres: string;
}

function codigoVencido(): ErrorDominio {
  return new ErrorDominio('CODIGO_VENCIDO', 'El código venció. Solicita uno nuevo.', 422);
}

function codigoAgotado(): ErrorDominio {
  return new ErrorDominio(
    'CODIGO_AGOTADO',
    'Superaste los intentos permitidos. Solicita un código nuevo.',
    422,
  );
}

function textoEspera(segundos: number): string {
  if (segundos === 60) return 'un minuto';
  return segundos === 1 ? '1 segundo' : `${segundos} segundos`;
}

@Injectable()
export class CodigoVerificacionService {
  private readonly logger = new Logger(CodigoVerificacionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametroService,
    @Inject(CORREO) private readonly correo: CorreoPort,
  ) {}

  async emitirVerificacionCorreo(usuario: UsuarioParaCodigo): Promise<void> {
    const minutosVigencia = await this.parametros.obtenerNumero('minutos_vigencia_codigo');
    const codigo = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const hashCodigo = await argon2.hash(codigo, { type: argon2.argon2id });
    const ahora = new Date();
    const expiraEn = new Date(ahora.getTime() + minutosVigencia * 60_000);

    await this.prisma.$transaction(async (tx) => {
      await tx.codigoVerificacion.updateMany({
        where: { usuarioId: usuario.id, proposito: PROPOSITO, usadoEn: null, expiraEn: { gt: ahora } },
        data: { expiraEn: ahora },
      });
      await tx.codigoVerificacion.create({
        data: { usuarioId: usuario.id, proposito: PROPOSITO, hashCodigo, expiraEn },
      });
    });

    const contenido = correoCodigoVerificacion({ nombres: usuario.nombres, codigo, minutosVigencia });
    await this.correo.enviar({ para: usuario.correo, ...contenido });
    this.logger.log(`Código de verificación de correo emitido para el usuario ${usuario.id}.`);
  }

  async verificarCorreo(datos: VerificarCorreoDto): Promise<MensajeDto> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { correo: datos.correo },
      select: { id: true, correoVerificado: true },
    });
    if (!usuario) throw new ErrorDominio('CODIGO_INVALIDO', MENSAJE_CODIGO_INVALIDO, 422);
    if (usuario.correoVerificado) return { mensaje: 'Tu correo ya está verificado.' };

    const ahora = new Date();
    const registro = await this.prisma.codigoVerificacion.findFirst({
      where: { usuarioId: usuario.id, proposito: PROPOSITO, usadoEn: null, expiraEn: { gt: ahora } },
      orderBy: { creadoEn: 'desc' },
    });
    if (!registro) throw codigoVencido();

    const maxIntentos = await this.parametros.obtenerNumero('max_intentos_codigo');
    if (registro.intentos >= maxIntentos) throw codigoAgotado();

    // El intento se reserva de forma atómica ANTES de comparar: si no, N peticiones simultáneas
    // evaluarían N códigos aunque el contador solo admita `maxIntentos`.
    const { count } = await this.prisma.codigoVerificacion.updateMany({
      where: { id: registro.id, usadoEn: null, intentos: { lt: maxIntentos } },
      data: { intentos: { increment: 1 } },
    });
    if (count === 0) throw codigoAgotado();

    const coincide = await argon2.verify(registro.hashCodigo, datos.codigo);
    if (!coincide) {
      const restantes = maxIntentos - (registro.intentos + 1);
      if (restantes <= 0) throw codigoAgotado();
      const mensaje =
        restantes === 1
          ? 'El código no es correcto. Te queda 1 intento.'
          : `El código no es correcto. Te quedan ${restantes} intentos.`;
      throw new ErrorDominio('CODIGO_INVALIDO', mensaje, 422, { intentosRestantes: restantes });
    }

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.codigoVerificacion.updateMany({
        where: { id: registro.id, usadoEn: null },
        data: { usadoEn: ahora },
      });
      if (count === 0) throw codigoVencido();
      await tx.usuario.update({ where: { id: usuario.id }, data: { correoVerificado: true } });
    });

    return { mensaje: 'Tu correo quedó verificado. Ya puedes ingresar.' };
  }

  async reenviarVerificacionCorreo(datos: ReenviarCodigoDto): Promise<MensajeDto> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { correo: datos.correo },
      select: {
        id: true,
        correo: true,
        correoVerificado: true,
        solicitante: { select: { nombres: true } },
      },
    });
    if (!usuario || usuario.correoVerificado) return { mensaje: MENSAJE_GENERICO_REENVIO };

    const segundosEspera = await this.parametros.obtenerNumero('segundos_espera_reenvio_codigo');
    const ultimo = await this.prisma.codigoVerificacion.findFirst({
      where: { usuarioId: usuario.id, proposito: PROPOSITO },
      orderBy: { creadoEn: 'desc' },
      select: { creadoEn: true },
    });
    if (ultimo && Date.now() - ultimo.creadoEn.getTime() < segundosEspera * 1000) {
      throw new ErrorDominio(
        'CODIGO_RECIENTE',
        `Espera ${textoEspera(segundosEspera)} antes de pedir otro código.`,
        429,
      );
    }

    await this.emitirVerificacionCorreo({
      id: usuario.id,
      correo: usuario.correo,
      nombres: usuario.solicitante?.nombres ?? usuario.correo,
    });
    return { mensaje: MENSAJE_GENERICO_REENVIO };
  }
}
