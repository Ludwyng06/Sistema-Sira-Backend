import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Rol } from '../../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UsuarioAutenticado } from './decoradores.js';

export interface CargaJwt {
  sub: string;
  correo: string;
  roles: Rol[];
  dependencias: string[];
  verificado: boolean;
  institucional: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRETO'),
    });
  }

  /**
   * El token solo prueba quién es; el estado actual lo dice la base. Un token vigente de una cuenta desactivada
   * se rechaza y, si se le quitó un rol, deja de valer para ese rol sin esperar a que venza (15 min).
   * Los roles del token solo pueden reducirse aquí, nunca ampliarse.
   */
  async validate(carga: CargaJwt): Promise<UsuarioAutenticado> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: carga.sub },
      select: { activo: true, roles: { select: { rol: true } } },
    });
    if (!usuario?.activo) throw new UnauthorizedException();

    const vigentes = new Set<Rol>(usuario.roles.map((fila) => fila.rol));
    return {
      id: carga.sub,
      correo: carga.correo,
      roles: (carga.roles ?? []).filter((rol) => vigentes.has(rol)),
      dependencias: carga.dependencias ?? [],
      correoVerificado: carga.verificado === true,
      esInstitucional: carga.institucional === true,
    };
  }
}
