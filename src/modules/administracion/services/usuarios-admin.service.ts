import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { Rol } from '../../../generated/prisma/enums.js';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ErrorDominio, noEncontrado } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { SesionService } from '../../identidad/services/sesion.service.js';
import type {
  FiltrosUsuariosDto,
  PaginaUsuariosDto,
  ReemplazarRolesDto,
  UsuarioAdminDto,
} from '../dto/usuario-admin.dto.js';

export interface ContextoAdmin {
  ip: string | null;
  userAgent: string | null;
  correlacionId: string | null;
}

/** Clave del candado consultivo de PostgreSQL para los cambios de administradores. */
const CANDADO_ADMINISTRADORES = 731_001;

const ROLES_SIN_DEPENDENCIA: Rol[] = [Rol.SOLICITANTE, Rol.ADMINISTRADOR, Rol.TESORERIA, Rol.AUDITOR];

const incluirUsuario = {
  roles: { select: { rol: true, dependenciaId: true }, orderBy: { creadoEn: 'asc' } },
  solicitante: { select: { nombres: true, apellidos: true, razonSocial: true } },
} satisfies Prisma.UsuarioInclude;

type FilaUsuario = Prisma.UsuarioGetPayload<{ include: typeof incluirUsuario }>;

function aDto(fila: FilaUsuario): UsuarioAdminDto {
  const perfil = fila.solicitante;
  const nombre = perfil
    ? [perfil.nombres, perfil.apellidos].filter((parte): parte is string => !!parte).join(' ') ||
      perfil.razonSocial
    : null;
  return {
    id: fila.id,
    correo: fila.correo,
    nombre,
    activo: fila.activo,
    correoVerificado: fila.correoVerificado,
    esInstitucional: fila.esInstitucional,
    roles: fila.roles.map((r) => ({ rol: r.rol, dependenciaId: r.dependenciaId })),
    ultimoIngresoEn: fila.ultimoIngresoEn?.toISOString() ?? null,
    creadoEn: fila.creadoEn.toISOString(),
  };
}

@Injectable()
export class UsuariosAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sesiones: SesionService,
  ) {}

  async listar(filtros: FiltrosUsuariosDto): Promise<PaginaUsuariosDto> {
    const busqueda = filtros.busqueda?.trim();
    const where: Prisma.UsuarioWhereInput = {
      ...(filtros.activo !== undefined ? { activo: filtros.activo } : {}),
      ...(filtros.rol ? { roles: { some: { rol: filtros.rol } } } : {}),
      ...(busqueda ? { correo: { contains: busqueda, mode: 'insensitive' } } : {}),
    };
    const [total, filas] = await Promise.all([
      this.prisma.usuario.count({ where }),
      this.prisma.usuario.findMany({
        where,
        include: incluirUsuario,
        orderBy: { creadoEn: 'desc' },
        skip: (filtros.pagina - 1) * filtros.porPagina,
        take: filtros.porPagina,
      }),
    ]);
    return { datos: filas.map(aDto), total, pagina: filtros.pagina, porPagina: filtros.porPagina };
  }

  async obtener(id: string): Promise<UsuarioAdminDto> {
    const fila = await this.prisma.usuario.findUnique({ where: { id }, include: incluirUsuario });
    if (!fila) throw noEncontrado('El usuario');
    return aDto(fila);
  }

  /** Desactivar cierra todas las sesiones. Un administrador no se desactiva a sí mismo ni al último. */
  async cambiarEstado(
    id: string,
    activo: boolean,
    actor: UsuarioAutenticado,
    contexto: ContextoAdmin,
  ): Promise<UsuarioAdminDto> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id },
      include: { roles: { select: { rol: true } } },
    });
    if (!usuario) throw noEncontrado('El usuario');

    if (!activo) {
      if (usuario.id === actor.id) {
        throw new ErrorDominio('AUTODESACTIVACION', 'No puedes desactivar tu propia cuenta.', 409);
      }
    }
    const quitaAdministrador =
      !activo && usuario.activo && usuario.roles.some((r) => r.rol === Rol.ADMINISTRADOR);

    await this.prisma.$transaction(async (tx) => {
      if (quitaAdministrador) await this.exigirOtroAdministrador(tx, usuario.id);
      await tx.usuario.update({ where: { id }, data: { activo } });
      if (!activo) await this.sesiones.revocarTodas(id, tx);
      await tx.bitacora.create({
        data: {
          usuarioId: actor.id,
          accion: activo ? 'USUARIO_ACTIVADO' : 'USUARIO_DESACTIVADO',
          entidad: 'Usuario',
          entidadId: id,
          datosAntes: { activo: usuario.activo },
          datosDespues: { activo },
          ip: contexto.ip,
          userAgent: contexto.userAgent,
          correlacionId: contexto.correlacionId,
        },
      });
    });
    return this.obtener(id);
  }

  /**
   * Reemplaza los roles. Reglas: APROBADOR exige una dependencia activa; RESPONSABLE_ESPACIO la admite
   * opcional; SOLICITANTE, ADMINISTRADOR, TESORERIA y AUDITOR no admiten dependencia; no hay filas
   * repetidas; no se quita ADMINISTRADOR al último administrador activo. Cierra las sesiones del
   * usuario para que su JWT se regenere con los roles nuevos.
   */
  async reemplazarRoles(
    id: string,
    datos: ReemplazarRolesDto,
    actor: UsuarioAutenticado,
    contexto: ContextoAdmin,
  ): Promise<UsuarioAdminDto> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id },
      include: { roles: { select: { rol: true, dependenciaId: true } } },
    });
    if (!usuario) throw noEncontrado('El usuario');

    const claves = new Set<string>();
    const dependencias = new Set<string>();
    for (const asignacion of datos.roles) {
      const clave = `${asignacion.rol}:${asignacion.dependenciaId ?? ''}`;
      if (claves.has(clave)) {
        throw new ErrorDominio('ROL_DUPLICADO', 'La lista repite un rol con la misma dependencia.', 422);
      }
      claves.add(clave);
      if (asignacion.rol === Rol.APROBADOR && !asignacion.dependenciaId) {
        throw new ErrorDominio('DEPENDENCIA_REQUERIDA', 'El rol APROBADOR exige una dependencia.', 422);
      }
      if (ROLES_SIN_DEPENDENCIA.includes(asignacion.rol) && asignacion.dependenciaId) {
        throw new ErrorDominio(
          'DEPENDENCIA_NO_ADMITIDA',
          `El rol ${asignacion.rol} no se acota a una dependencia.`,
          422,
        );
      }
      if (asignacion.dependenciaId) dependencias.add(asignacion.dependenciaId);
    }

    if (dependencias.size > 0) {
      const existentes = await this.prisma.dependencia.findMany({
        where: { id: { in: [...dependencias] }, activa: true },
        select: { id: true },
      });
      if (existentes.length !== dependencias.size) {
        throw new ErrorDominio(
          'DEPENDENCIA_NO_ENCONTRADA',
          'Alguna de las dependencias indicadas no existe o está archivada.',
          404,
        );
      }
    }

    const eraAdministrador = usuario.roles.some((r) => r.rol === Rol.ADMINISTRADOR);
    const seraAdministrador = datos.roles.some((r) => r.rol === Rol.ADMINISTRADOR);
    const quitaAdministrador = eraAdministrador && !seraAdministrador && usuario.activo;

    await this.prisma.$transaction(async (tx) => {
      if (quitaAdministrador) await this.exigirOtroAdministrador(tx, usuario.id);
      await tx.usuarioRol.deleteMany({ where: { usuarioId: id } });
      if (datos.roles.length > 0) {
        await tx.usuarioRol.createMany({
          data: datos.roles.map((r) => ({
            usuarioId: id,
            rol: r.rol,
            dependenciaId: r.dependenciaId ?? null,
          })),
        });
      }
      await this.sesiones.revocarTodas(id, tx);
      await tx.bitacora.create({
        data: {
          usuarioId: actor.id,
          accion: 'USUARIO_ROLES_REEMPLAZADOS',
          entidad: 'Usuario',
          entidadId: id,
          datosAntes: { roles: usuario.roles },
          datosDespues: {
            roles: datos.roles.map((r) => ({ rol: r.rol, dependenciaId: r.dependenciaId ?? null })),
          },
          ip: contexto.ip,
          userAgent: contexto.userAgent,
          correlacionId: contexto.correlacionId,
        },
      });
    });
    return this.obtener(id);
  }

  /**
   * Debe llamarse dentro de la transacción. El candado consultivo serializa los cambios que quitan un
   * administrador: sin él, dos administradores que se desactivan entre sí a la vez dejan el sistema sin ninguno.
   */
  private async exigirOtroAdministrador(tx: Prisma.TransactionClient, excluirId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CANDADO_ADMINISTRADORES})`;
    const otros = await tx.usuario.count({
      where: { id: { not: excluirId }, activo: true, roles: { some: { rol: Rol.ADMINISTRADOR } } },
    });
    if (otros === 0) {
      throw new ErrorDominio(
        'ULTIMO_ADMINISTRADOR',
        'Debe quedar al menos un administrador activo en el sistema.',
        409,
      );
    }
  }
}
