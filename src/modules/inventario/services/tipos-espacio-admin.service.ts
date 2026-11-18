import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import {
  ErrorDominio,
  noEncontrado,
} from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  ActualizarTipoEspacioDto,
  CrearTipoEspacioDto,
  FiltrosCatalogoDto,
  PaginaTiposEspacioDto,
  TipoEspacioAdminDto,
} from '../dto/catalogo-admin.dto.js';

const incluirConteo = {
  _count: { select: { espacios: { where: { archivadoEn: null } } } },
} satisfies Prisma.TipoEspacioInclude;
type FilaTipo = Prisma.TipoEspacioGetPayload<{ include: typeof incluirConteo }>;

function aDto(fila: FilaTipo): TipoEspacioAdminDto {
  return {
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    anticipacionMinimaDias: fila.anticipacionMinimaDias,
    anticipacionEnHabiles: fila.anticipacionEnHabiles,
    aforoExigePoliza: fila.aforoExigePoliza,
    icono: fila.icono,
    activo: fila.activo,
    espaciosActivos: fila._count.espacios,
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
    'Ya existe un tipo de espacio con ese código.',
    409,
  );
}

@Injectable()
export class TiposEspacioAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtros: FiltrosCatalogoDto): Promise<PaginaTiposEspacioDto> {
    const where: Prisma.TipoEspacioWhereInput =
      filtros.activo === undefined ? {} : { activo: filtros.activo };
    const [total, filas] = await Promise.all([
      this.prisma.tipoEspacio.count({ where }),
      this.prisma.tipoEspacio.findMany({
        where,
        include: incluirConteo,
        orderBy: { nombre: 'asc' },
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

  async obtener(id: string): Promise<TipoEspacioAdminDto> {
    const fila = await this.prisma.tipoEspacio.findUnique({
      where: { id },
      include: incluirConteo,
    });
    if (!fila) throw noEncontrado('El tipo de espacio');
    return aDto(fila);
  }

  async crear(datos: CrearTipoEspacioDto): Promise<TipoEspacioAdminDto> {
    if (
      await this.prisma.tipoEspacio.findUnique({
        where: { codigo: datos.codigo },
        select: { id: true },
      })
    ) {
      throw codigoRepetido();
    }
    try {
      const fila = await this.prisma.tipoEspacio.create({
        data: {
          codigo: datos.codigo,
          nombre: datos.nombre.trim(),
          ...(datos.anticipacionMinimaDias !== undefined
            ? { anticipacionMinimaDias: datos.anticipacionMinimaDias }
            : {}),
          ...(datos.anticipacionEnHabiles !== undefined
            ? { anticipacionEnHabiles: datos.anticipacionEnHabiles }
            : {}),
          aforoExigePoliza: datos.aforoExigePoliza ?? null,
          icono: datos.icono?.trim() || null,
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
    datos: ActualizarTipoEspacioDto,
  ): Promise<TipoEspacioAdminDto> {
    if (
      !(await this.prisma.tipoEspacio.findUnique({
        where: { id },
        select: { id: true },
      }))
    ) {
      throw noEncontrado('El tipo de espacio');
    }
    const fila = await this.prisma.tipoEspacio.update({
      where: { id },
      data: {
        ...(datos.nombre !== undefined ? { nombre: datos.nombre.trim() } : {}),
        ...(datos.anticipacionMinimaDias !== undefined
          ? { anticipacionMinimaDias: datos.anticipacionMinimaDias }
          : {}),
        ...(datos.anticipacionEnHabiles !== undefined
          ? { anticipacionEnHabiles: datos.anticipacionEnHabiles }
          : {}),
        ...(datos.aforoExigePoliza !== undefined
          ? { aforoExigePoliza: datos.aforoExigePoliza }
          : {}),
        ...(datos.icono !== undefined
          ? { icono: datos.icono?.trim() || null }
          : {}),
      },
      include: incluirConteo,
    });
    return aDto(fila);
  }

  /** Nada se borra: el tipo se archiva, salvo que aún tenga espacios sin archivar. */
  async archivar(id: string): Promise<TipoEspacioAdminDto> {
    const actual = await this.prisma.tipoEspacio.findUnique({
      where: { id },
      include: incluirConteo,
    });
    if (!actual) throw noEncontrado('El tipo de espacio');
    if (!actual.activo) return aDto(actual);
    if (actual._count.espacios > 0) {
      throw new ErrorDominio(
        'TIPO_CON_ESPACIOS',
        'Hay espacios activos de este tipo. Cámbiales el tipo o archívalos antes de archivarlo.',
        409,
        { espacios: actual._count.espacios },
      );
    }
    return aDto(
      await this.prisma.tipoEspacio.update({
        where: { id },
        data: { activo: false },
        include: incluirConteo,
      }),
    );
  }

  async restaurar(id: string): Promise<TipoEspacioAdminDto> {
    if (
      !(await this.prisma.tipoEspacio.findUnique({
        where: { id },
        select: { id: true },
      }))
    ) {
      throw noEncontrado('El tipo de espacio');
    }
    return aDto(
      await this.prisma.tipoEspacio.update({
        where: { id },
        data: { activo: true },
        include: incluirConteo,
      }),
    );
  }
}
