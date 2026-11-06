import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import {
  ErrorDominio,
  noEncontrado,
} from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  ActualizarBloqueDto,
  BloqueAdminDto,
  CrearBloqueDto,
  FiltrosBloquesDto,
  PaginaBloquesDto,
} from '../dto/catalogo-admin.dto.js';

const incluir = {
  sede: { select: { codigo: true } },
  _count: { select: { espacios: { where: { archivadoEn: null } } } },
} satisfies Prisma.BloqueInclude;
type FilaBloque = Prisma.BloqueGetPayload<{ include: typeof incluir }>;

function aDto(fila: FilaBloque): BloqueAdminDto {
  return {
    id: fila.id,
    sedeId: fila.sedeId,
    sedeCodigo: fila.sede.codigo,
    codigo: fila.codigo,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    numeroPisos: fila.numeroPisos,
    orden: fila.orden,
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
    'Ya existe un bloque con ese código en la sede.',
    409,
  );
}

@Injectable()
export class BloquesAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtros: FiltrosBloquesDto): Promise<PaginaBloquesDto> {
    const where: Prisma.BloqueWhereInput = {
      ...(filtros.activo === undefined ? {} : { activo: filtros.activo }),
      ...(filtros.sedeId ? { sedeId: filtros.sedeId } : {}),
    };
    const [total, filas] = await Promise.all([
      this.prisma.bloque.count({ where }),
      this.prisma.bloque.findMany({
        where,
        include: incluir,
        orderBy: [
          { sede: { orden: 'asc' } },
          { orden: 'asc' },
          { codigo: 'asc' },
        ],
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

  async obtener(id: string): Promise<BloqueAdminDto> {
    const fila = await this.prisma.bloque.findUnique({
      where: { id },
      include: incluir,
    });
    if (!fila) throw noEncontrado('El bloque');
    return aDto(fila);
  }

  async crear(datos: CrearBloqueDto): Promise<BloqueAdminDto> {
    const sede = await this.prisma.sede.findUnique({
      where: { id: datos.sedeId },
      select: { activa: true },
    });
    if (!sede) throw noEncontrado('La sede');
    if (!sede.activa) {
      throw new ErrorDominio(
        'SEDE_ARCHIVADA',
        'No se pueden crear bloques en una sede archivada.',
        422,
      );
    }
    const repetido = await this.prisma.bloque.findUnique({
      where: { sedeId_codigo: { sedeId: datos.sedeId, codigo: datos.codigo } },
      select: { id: true },
    });
    if (repetido) throw codigoRepetido();

    try {
      const fila = await this.prisma.bloque.create({
        data: {
          sedeId: datos.sedeId,
          codigo: datos.codigo,
          nombre: datos.nombre.trim(),
          descripcion: datos.descripcion?.trim() || null,
          numeroPisos: datos.numeroPisos,
          orden: datos.orden ?? 0,
        },
        include: incluir,
      });
      return aDto(fila);
    } catch (error) {
      if (esCodigoRepetido(error)) throw codigoRepetido();
      throw error;
    }
  }

  async actualizar(
    id: string,
    datos: ActualizarBloqueDto,
  ): Promise<BloqueAdminDto> {
    if (
      !(await this.prisma.bloque.findUnique({
        where: { id },
        select: { id: true },
      }))
    ) {
      throw noEncontrado('El bloque');
    }
    if (datos.numeroPisos !== undefined) {
      const sobrantes = await this.prisma.espacio.count({
        where: {
          bloqueId: id,
          archivadoEn: null,
          piso: { gt: datos.numeroPisos },
        },
      });
      if (sobrantes > 0) {
        throw new ErrorDominio(
          'PISOS_CON_ESPACIOS',
          `Hay ${sobrantes} espacio(s) en pisos superiores a ${datos.numeroPisos}. Muévelos o archívalos primero.`,
          422,
          { espacios: sobrantes },
        );
      }
    }
    const fila = await this.prisma.bloque.update({
      where: { id },
      data: {
        ...(datos.nombre !== undefined ? { nombre: datos.nombre.trim() } : {}),
        ...(datos.descripcion !== undefined
          ? { descripcion: datos.descripcion?.trim() || null }
          : {}),
        ...(datos.numeroPisos !== undefined
          ? { numeroPisos: datos.numeroPisos }
          : {}),
        ...(datos.orden !== undefined ? { orden: datos.orden } : {}),
      },
      include: incluir,
    });
    return aDto(fila);
  }

  /** Nada se borra: el bloque se archiva, salvo que aún tenga espacios sin archivar. */
  async archivar(id: string): Promise<BloqueAdminDto> {
    const actual = await this.prisma.bloque.findUnique({
      where: { id },
      include: incluir,
    });
    if (!actual) throw noEncontrado('El bloque');
    if (!actual.activo) return aDto(actual);
    if (actual._count.espacios > 0) {
      throw new ErrorDominio(
        'BLOQUE_CON_ESPACIOS',
        'El bloque tiene espacios activos. Archívalos antes de archivar el bloque.',
        409,
        { espacios: actual._count.espacios },
      );
    }
    return aDto(
      await this.prisma.bloque.update({
        where: { id },
        data: { activo: false },
        include: incluir,
      }),
    );
  }

  async restaurar(id: string): Promise<BloqueAdminDto> {
    const actual = await this.prisma.bloque.findUnique({
      where: { id },
      include: { sede: { select: { activa: true } } },
    });
    if (!actual) throw noEncontrado('El bloque');
    if (!actual.sede.activa) {
      throw new ErrorDominio(
        'SEDE_ARCHIVADA',
        'Restaura primero la sede del bloque.',
        422,
      );
    }
    return aDto(
      await this.prisma.bloque.update({
        where: { id },
        data: { activo: true },
        include: incluir,
      }),
    );
  }
}
