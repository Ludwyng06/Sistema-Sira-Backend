import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ErrorDominio, noEncontrado } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  ActualizarDependenciaDto,
  CrearDependenciaDto,
  DependenciaAdminDto,
  FiltrosDependenciasDto,
  PaginaDependenciasDto,
} from '../dto/dependencia-admin.dto.js';
import type { ContextoAdmin } from './usuarios-admin.service.js';

const incluirJefe = { jefe: { select: { id: true, correo: true } } } satisfies Prisma.DependenciaInclude;
type FilaDependencia = Prisma.DependenciaGetPayload<{ include: typeof incluirJefe }>;

function aDto(fila: FilaDependencia): DependenciaAdminDto {
  return {
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    centroCosto: fila.centroCosto,
    jefe: fila.jefe ? { id: fila.jefe.id, correo: fila.jefe.correo } : null,
    activa: fila.activa,
    creadoEn: fila.creadoEn.toISOString(),
  };
}

function esCodigoRepetido(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

function codigoRepetido(): ErrorDominio {
  return new ErrorDominio('CODIGO_REGISTRADO', 'Ya existe una dependencia con ese código.', 409);
}

@Injectable()
export class DependenciasAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtros: FiltrosDependenciasDto): Promise<PaginaDependenciasDto> {
    const where: Prisma.DependenciaWhereInput = filtros.activa === undefined ? {} : { activa: filtros.activa };
    const [total, filas] = await Promise.all([
      this.prisma.dependencia.count({ where }),
      this.prisma.dependencia.findMany({
        where,
        include: incluirJefe,
        orderBy: { nombre: 'asc' },
        skip: (filtros.pagina - 1) * filtros.porPagina,
        take: filtros.porPagina,
      }),
    ]);
    return { datos: filas.map(aDto), total, pagina: filtros.pagina, porPagina: filtros.porPagina };
  }

  async obtener(id: string): Promise<DependenciaAdminDto> {
    const fila = await this.prisma.dependencia.findUnique({ where: { id }, include: incluirJefe });
    if (!fila) throw noEncontrado('La dependencia');
    return aDto(fila);
  }

  async crear(
    datos: CrearDependenciaDto,
    actor: UsuarioAutenticado,
    contexto: ContextoAdmin,
  ): Promise<DependenciaAdminDto> {
    const existente = await this.prisma.dependencia.findUnique({
      where: { codigo: datos.codigo },
      select: { id: true },
    });
    if (existente) throw codigoRepetido();
    if (datos.jefeId) await this.exigirJefeActivo(datos.jefeId);

    try {
      const fila = await this.prisma.$transaction(async (tx) => {
        const creada = await tx.dependencia.create({
          data: {
            codigo: datos.codigo,
            nombre: datos.nombre.trim(),
            centroCosto: datos.centroCosto ?? null,
            jefeId: datos.jefeId ?? null,
          },
          include: incluirJefe,
        });
        await this.registrar(tx, actor, contexto, 'DEPENDENCIA_CREADA', creada.id, null, {
          codigo: creada.codigo,
          nombre: creada.nombre,
          jefeId: creada.jefeId,
        });
        return creada;
      });
      return aDto(fila);
    } catch (error) {
      if (esCodigoRepetido(error)) throw codigoRepetido();
      throw error;
    }
  }

  async actualizar(
    id: string,
    datos: ActualizarDependenciaDto,
    actor: UsuarioAutenticado,
    contexto: ContextoAdmin,
  ): Promise<DependenciaAdminDto> {
    const actual = await this.prisma.dependencia.findUnique({ where: { id } });
    if (!actual) throw noEncontrado('La dependencia');
    if (datos.jefeId) await this.exigirJefeActivo(datos.jefeId);

    const cambios: Prisma.DependenciaUpdateInput = {
      ...(datos.nombre !== undefined ? { nombre: datos.nombre.trim() } : {}),
      ...(datos.centroCosto !== undefined ? { centroCosto: datos.centroCosto } : {}),
      ...(datos.jefeId !== undefined
        ? { jefe: datos.jefeId === null ? { disconnect: true } : { connect: { id: datos.jefeId } } }
        : {}),
    };

    const fila = await this.prisma.$transaction(async (tx) => {
      const actualizada = await tx.dependencia.update({ where: { id }, data: cambios, include: incluirJefe });
      await this.registrar(
        tx,
        actor,
        contexto,
        'DEPENDENCIA_ACTUALIZADA',
        id,
        { nombre: actual.nombre, centroCosto: actual.centroCosto, jefeId: actual.jefeId },
        { nombre: actualizada.nombre, centroCosto: actualizada.centroCosto, jefeId: actualizada.jefeId },
      );
      return actualizada;
    });
    return aDto(fila);
  }

  /** Archivar en vez de borrar; no se archiva si aún tiene espacios activos. */
  async archivar(id: string, actor: UsuarioAutenticado, contexto: ContextoAdmin): Promise<void> {
    const actual = await this.prisma.dependencia.findUnique({ where: { id } });
    if (!actual) throw noEncontrado('La dependencia');
    if (!actual.activa) return;

    const espacios = await this.prisma.espacio.count({ where: { dependenciaId: id, archivadoEn: null } });
    if (espacios > 0) {
      throw new ErrorDominio(
        'DEPENDENCIA_CON_ESPACIOS',
        'La dependencia tiene espacios activos. Reasígnalos o archívalos antes de archivarla.',
        409,
        { espacios },
      );
    }
    await this.cambiarActiva(id, false, actual.activa, actor, contexto, 'DEPENDENCIA_ARCHIVADA');
  }

  async restaurar(id: string, actor: UsuarioAutenticado, contexto: ContextoAdmin): Promise<void> {
    const actual = await this.prisma.dependencia.findUnique({ where: { id } });
    if (!actual) throw noEncontrado('La dependencia');
    if (actual.activa) return;
    await this.cambiarActiva(id, true, actual.activa, actor, contexto, 'DEPENDENCIA_RESTAURADA');
  }

  private async cambiarActiva(
    id: string,
    activa: boolean,
    anterior: boolean,
    actor: UsuarioAutenticado,
    contexto: ContextoAdmin,
    accion: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.dependencia.update({ where: { id }, data: { activa } });
      await this.registrar(tx, actor, contexto, accion, id, { activa: anterior }, { activa });
    });
  }

  private async exigirJefeActivo(jefeId: string): Promise<void> {
    const jefe = await this.prisma.usuario.findFirst({ where: { id: jefeId, activo: true }, select: { id: true } });
    if (!jefe) {
      throw new ErrorDominio('JEFE_NO_VALIDO', 'El jefe indicado no existe o está inactivo.', 422);
    }
  }

  private async registrar(
    tx: Prisma.TransactionClient,
    actor: UsuarioAutenticado,
    contexto: ContextoAdmin,
    accion: string,
    entidadId: string,
    antes: Prisma.InputJsonValue | null,
    despues: Prisma.InputJsonValue,
  ): Promise<void> {
    await tx.bitacora.create({
      data: {
        usuarioId: actor.id,
        accion,
        entidad: 'Dependencia',
        entidadId,
        ...(antes ? { datosAntes: antes } : {}),
        datosDespues: despues,
        ip: contexto.ip,
        userAgent: contexto.userAgent,
        correlacionId: contexto.correlacionId,
      },
    });
  }
}
