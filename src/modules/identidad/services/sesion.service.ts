import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { CargaJwt } from '../../../shared/auth/jwt.strategy.js';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { UsuarioSesionDto } from '../dto/respuestas.js';

export interface ContextoSesion {
  ip: string | null;
  userAgent: string | null;
}

export interface SesionEmitida {
  accessToken: string;
  expiraEn: number;
  refreshToken: string;
  refreshExpiraEn: Date;
  usuario: UsuarioSesionDto;
}

const MS_POR_DIA = 86_400_000;
/** Ventana en la que un token recién rotado vuelve a llegar por una carrera legítima (varias pestañas). */
export const GRACIA_REFRESCO_MS = 10_000;

const incluirUsuario = {
  roles: true,
  solicitante: true,
  dependenciasJefe: { select: { id: true } },
} satisfies Prisma.UsuarioInclude;

type UsuarioCompleto = Prisma.UsuarioGetPayload<{ include: typeof incluirUsuario }>;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sesionInvalida(): ErrorDominio {
  return new ErrorDominio('SESION_INVALIDA', 'Tu sesión terminó. Ingresa de nuevo.', 401);
}

function refrescoConcurrente(): ErrorDominio {
  return new ErrorDominio(
    'REFRESCO_CONCURRENTE',
    'Tu sesión se está renovando en otra pestaña. Intenta de nuevo en unos segundos.',
    401,
  );
}

function sesionRevocada(): ErrorDominio {
  return new ErrorDominio('SESION_REVOCADA', 'Por seguridad cerramos tu sesión. Ingresa de nuevo.', 401);
}

function aDto(usuario: UsuarioCompleto): UsuarioSesionDto {
  const perfil = usuario.solicitante;
  return {
    id: usuario.id,
    correo: usuario.correo,
    correoVerificado: usuario.correoVerificado,
    esInstitucional: usuario.esInstitucional,
    roles: usuario.roles.map((fila) => ({ rol: fila.rol, dependenciaId: fila.dependenciaId })),
    perfil: perfil
      ? {
          tipo: perfil.tipo,
          nombres: perfil.nombres,
          apellidos: perfil.apellidos,
          razonSocial: perfil.razonSocial,
          tipoDocumento: perfil.tipoDocumento,
          numeroDocumento: perfil.numeroDocumento,
          telefono: perfil.telefono,
          dependenciaId: perfil.dependenciaId,
        }
      : null,
  };
}

function aCarga(usuario: UsuarioCompleto): CargaJwt {
  const dependencias = new Set<string>();
  for (const fila of usuario.roles) {
    if (fila.dependenciaId) dependencias.add(fila.dependenciaId);
  }
  for (const dependencia of usuario.dependenciasJefe) dependencias.add(dependencia.id);
  return {
    sub: usuario.id,
    correo: usuario.correo,
    roles: [...new Set(usuario.roles.map((fila) => fila.rol))],
    dependencias: [...dependencias],
    verificado: usuario.correoVerificado,
    institucional: usuario.esInstitucional,
  };
}

@Injectable()
export class SesionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async iniciar(usuarioId: string, contexto: ContextoSesion): Promise<SesionEmitida> {
    const usuario = await this.cargarUsuarioActivo(usuarioId);
    return this.emitir(this.prisma, usuario, randomUUID(), contexto);
  }

  async rotar(refreshToken: string, contexto: ContextoSesion): Promise<SesionEmitida> {
    const ahora = new Date();
    const sesion = await this.prisma.sesionRefresh.findUnique({
      where: { hashToken: hashToken(refreshToken) },
      include: { usuario: { select: { activo: true } } },
    });
    if (!sesion || sesion.expiraEn <= ahora || !sesion.usuario.activo) throw sesionInvalida();
    if (sesion.revocadoEn) {
      if (ahora.getTime() - sesion.revocadoEn.getTime() < GRACIA_REFRESCO_MS) throw refrescoConcurrente();
      await this.revocarFamilia(sesion.familia, ahora);
      throw sesionRevocada();
    }

    const usuario = await this.cargarUsuarioActivo(sesion.usuarioId);
    const emitida = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.sesionRefresh.updateMany({
        where: { id: sesion.id, revocadoEn: null },
        data: { revocadoEn: ahora },
      });
      if (count === 0) return null;
      return this.emitir(tx, usuario, sesion.familia, contexto);
    });
    if (!emitida) throw refrescoConcurrente();
    return emitida;
  }

  async cerrar(refreshToken: string | null): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.sesionRefresh.updateMany({
      where: { hashToken: hashToken(refreshToken), revocadoEn: null },
      data: { revocadoEn: new Date() },
    });
  }

  async revocarTodas(usuarioId: string, tx?: Prisma.TransactionClient): Promise<void> {
    const cliente = tx ?? this.prisma;
    await cliente.sesionRefresh.updateMany({
      where: { usuarioId, revocadoEn: null },
      data: { revocadoEn: new Date() },
    });
  }

  async datosUsuario(usuarioId: string): Promise<UsuarioSesionDto> {
    return aDto(await this.cargarUsuarioActivo(usuarioId));
  }

  private async cargarUsuarioActivo(usuarioId: string): Promise<UsuarioCompleto> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      include: incluirUsuario,
    });
    if (!usuario?.activo) throw sesionInvalida();
    return usuario;
  }

  private async revocarFamilia(familia: string, ahora: Date): Promise<void> {
    await this.prisma.sesionRefresh.updateMany({
      where: { familia, revocadoEn: null },
      data: { revocadoEn: ahora },
    });
  }

  private async emitir(
    cliente: Pick<Prisma.TransactionClient, 'sesionRefresh'>,
    usuario: UsuarioCompleto,
    familia: string,
    contexto: ContextoSesion,
  ): Promise<SesionEmitida> {
    const accessToken = await this.jwt.signAsync({ ...aCarga(usuario) });
    const decodificado = this.jwt.decode<{ exp: number; iat: number }>(accessToken);
    const refreshToken = randomBytes(32).toString('base64url');
    const dias = this.config.getOrThrow<number>('JWT_REFRESH_DIAS');
    const refreshExpiraEn = new Date(Date.now() + dias * MS_POR_DIA);

    await cliente.sesionRefresh.create({
      data: {
        usuarioId: usuario.id,
        hashToken: hashToken(refreshToken),
        familia,
        expiraEn: refreshExpiraEn,
        ip: contexto.ip,
        userAgent: contexto.userAgent,
      },
    });

    return {
      accessToken,
      expiraEn: decodificado.exp - decodificado.iat,
      refreshToken,
      refreshExpiraEn,
      usuario: aDto(usuario),
    };
  }
}
