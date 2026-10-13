import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Rol } from '../../generated/prisma/enums.js';

export const CLAVE_PUBLICO = 'sira:publico';
export const CLAVE_ROLES = 'sira:roles';

export interface UsuarioAutenticado {
  id: string;
  correo: string;
  roles: Rol[];
  /** Ids de las dependencias sobre las que el usuario tiene alcance. */
  dependencias: string[];
  correoVerificado: boolean;
  esInstitucional: boolean;
}

/** Endpoint accesible sin sesión. */
export const Publico = () => SetMetadata(CLAVE_PUBLICO, true);

/** Exige que el usuario tenga al menos uno de los roles indicados. */
export const Roles = (...roles: Rol[]) => SetMetadata(CLAVE_ROLES, roles);

/** Inyecta el usuario autenticado de la petición. */
export const UsuarioActual = createParamDecorator(
  (_datos: unknown, contexto: ExecutionContext): UsuarioAutenticado => {
    return contexto.switchToHttp().getRequest<{ user: UsuarioAutenticado }>().user;
  },
);
