import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Rol } from '../../generated/prisma/enums.js';
import { CLAVE_PUBLICO, CLAVE_ROLES, type UsuarioAutenticado } from './decoradores.js';

/** Todo exige sesión salvo los endpoints marcados con @Publico(). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(contexto: ExecutionContext) {
    const esPublico = this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (esPublico) return true;
    return super.canActivate(contexto);
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const requeridos = this.reflector.getAllAndOverride<Rol[] | undefined>(CLAVE_ROLES, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (!requeridos || requeridos.length === 0) return true;

    const usuario = contexto.switchToHttp().getRequest<{ user?: UsuarioAutenticado }>().user;
    if (!usuario || !requeridos.some((rol) => usuario.roles.includes(rol))) {
      throw new ForbiddenException();
    }
    return true;
  }
}
