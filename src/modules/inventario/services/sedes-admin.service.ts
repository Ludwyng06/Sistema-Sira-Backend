import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import {
  ErrorDominio,
  noEncontrado,
} from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  ActualizarSedeDto,
  CrearSedeDto,
  FiltrosCatalogoDto,
  PaginaSedesDto,
  SedeAdminDto,
} from '../dto/catalogo-admin.dto.js';

const incluirConteo = {
  _count: { select: { bloques: { where: { activo: true } } } },
} satisfies Prisma.SedeInclude;
type FilaSede = Prisma.SedeGetPayload<{ include: typeof incluirConteo }>;

function aDto(fila: FilaSede): SedeAdminDto {
  return {
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    municipio: fila.municipio,
    direccion: fila.direccion,
    telefono: fila.telefono,
    orden: fila.orden,
    activa: fila.activa,
    bloquesActivos: fila._count.bloques,
  };
}

function esCodigoRepetido(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  );
}

function codigoRepetido(): ErrorDominio {
  return new ErrorDominio(
    'CODIGO_REGISTRADO',
    'Ya existe una sede con ese código.',
    409,
  );
}

@Injectable()
export class SedesAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtros: FiltrosCatalogoDto): Promise<PaginaSedesDto> {
    const where: Prisma.SedeWhereInput =
      filtros.activo === undefined ? {} : { activa: filtros.activo };
    const [total, filas] = await Promise.all([
      this.prisma.sede.count({ where }),
      this.prisma.sede.findMany({
        where,
        include: incluirConteo,
        orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
        skip: (filtros.pagina - 1) * filtros.porPagina,
        take: filtros.porPagina,
      }),
    ]);
    return {
      datos: filas.map(aDto),
      total,
      pagina: filtros.pagina,
      porPagina: filtros.porPagina,
    };
  }

  async obtener(id: string): Promise<SedeAdminDto> {
    const fila = await this.prisma.sede.findUnique({
      where: { id },
      include: incluirConteo,
    });
    if (!fila) throw noEncontrado('La sede');
    return aDto(fila);
  }

  async crear(datos: CrearSedeDto): Promise<SedeAdminDto> {
    if (
      await this.prisma.sede.findUnique({
        where: { codigo: datos.codigo },
        select: { id: true },
      })
    ) {
      throw codigoRepetido();
    }
    try {
      const fila = await this.prisma.sede.create({
        data: {
          codigo: datos.codigo,
          nombre: datos.nombre.trim(),
          municipio: datos.municipio.trim(),
          direccion: datos.direccion?.trim() || null,
          telefono: datos.telefono?.trim() || null,
          orden: datos.orden ?? 0,
        },
        include: incluirConteo,
      });
      return aDto(fila);
    } catch (error) {
      if (esCodigoRepetido(error)) throw codigoRepetido();
      throw error;
    }
  }

  async actualizar(
    id: string,
    datos: ActualizarSedeDto,
  ): Promise<SedeAdminDto> {
    if (
      !(await this.prisma.sede.findUnique({
        where: { id },
        select: { id: true },
      }))
    ) {
      throw noEncontrado('La sede');
    }
    const fila = await this.prisma.sede.update({
      where: { id },
      data: {
        ...(datos.nombre !== undefined ? { nombre: datos.nombre.trim() } : {}),
        ...(datos.municipio !== undefined
          ? { municipio: datos.municipio.trim() }
          : {}),
        ...(datos.direccion !== undefined
          ? { direccion: datos.direccion?.trim() || null }
          : {}),
        ...(datos.telefono !== undefined
          ? { telefono: datos.telefono?.trim() || null }
          : {}),
        ...(datos.orden !== undefined ? { orden: datos.orden } : {}),
      },
      include: incluirConteo,
    });
    return aDto(fila);
  }

  /** Nada se borra: la sede se archiva, salvo que aún tenga bloques activos. */
  async archivar(id: string): Promise<SedeAdminDto> {
    const actual = await this.prisma.sede.findUnique({
      where: { id },
      include: incluirConteo,
    });
    if (!actual) throw noEncontrado('La sede');
    if (!actual.activa) return aDto(actual);
    if (actual._count.bloques > 0) {
      throw new ErrorDominio(
        'SEDE_CON_BLOQUES',
        'La sede tiene bloques activos. Archívalos antes de archivar la sede.',
        409,
        { bloques: actual._count.bloques },
      );
    }
    return aDto(
      await this.prisma.sede.update({
        where: { id },
        data: { activa: false },
        include: incluirConteo,
      }),
    );
  }

  async restaurar(id: string): Promise<SedeAdminDto> {
    if (
      !(await this.prisma.sede.findUnique({
        where: { id },
        select: { id: true },
      }))
    ) {
      throw noEncontrado('La sede');
    }
    return aDto(
      await this.prisma.sede.update({
        where: { id },
        data: { activa: true },
        include: incluirConteo,
      }),
    );
  }
}
