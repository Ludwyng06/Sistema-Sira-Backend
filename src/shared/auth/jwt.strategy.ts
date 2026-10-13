import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Rol } from '../../generated/prisma/enums.js';
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
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRETO'),
    });
  }

  validate(carga: CargaJwt): UsuarioAutenticado {
    return {
      id: carga.sub,
      correo: carga.correo,
      roles: carga.roles ?? [],
      dependencias: carga.dependencias ?? [],
      correoVerificado: carga.verificado === true,
      esInstitucional: carga.institucional === true,
    };
  }
}
