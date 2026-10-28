import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import {
  ErrorDominio,
  noEncontrado,
} from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  ActualizarElementoDto,
  CrearElementoDto,
  ElementoAdminDto,
  FiltrosElementosDto,
  PaginaElementosDto,
} from '../dto/catalogo-admin.dto.js';

const incluir = {
  espacio: { select: { codigo: true } },
} satisfies Prisma.ElementoInclude;
type FilaElemento = Prisma.ElementoGetPayload<{ include: typeof incluir }>;

function aDto(fila: FilaElemento): ElementoAdminDto {
  return {
    id: fila.id,
    espacioId: fila.espacioId,
    espacioCodigo: fila.espacio.codigo,
    nombre: fila.nombre,
    placaInventario: fila.placaInventario,
    marca: fila.marca,
    modelo: fila.modelo,
    serie: fila.serie,
    cantidad: fila.cantidad,
    unidad: fila.unidad,
    estadoFisico: fila.estadoFisico,
    estado: fila.estado,
    valorUnitario: fila.valorUnitario,
    fechaAdquisicion: fila.fechaAdquisicion
      ? fila.fechaAdquisicion.toISOString().slice(0, 10)
      : null,
    vidaUtilMeses: fila.vidaUtilMeses,
    esPrestable: fila.esPrestable,
  };
}

function esPlacaRepetida(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  );
}

function placaRepetida(): ErrorDominio {
  return new ErrorDominio(
    'PLACA_REGISTRADA',
    'Ya existe un elemento con esa placa de inventario.',
    409,
  );
}

function fecha(valor: string | null | undefined): Date | null | undefined {
  if (valor === undefined) return undefined;
  return valor === null ? null : new Date(`${valor}T00:00:00.000Z`);
}

@Injectable()
export class ElementosAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtros: FiltrosElementosDto): Promise<PaginaElementosDto> {
    const where: Prisma.ElementoWhereInput = {
      ...(filtros.espacioId ? { espacioId: filtros.espacioId } : {}),
      ...(filtros.estado ? { estado: filtros.estado } : {}),
    };
    const [total, filas] = await Promise.all([
      this.prisma.elemento.count({ where }),
      this.prisma.elemento.findMany({
        where,
        include: incluir,
        orderBy: [{ espacio: { codigo: 'asc' } }, { nombre: 'asc' }],
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

  async obtener(id: string): Promise<ElementoAdminDto> {
    const fila = await this.prisma.elemento.findUnique({
      where: { id },
      include: incluir,
    });
    if (!fila) throw noEncontrado('El elemento');
    return aDto(fila);
  }

  async crear(datos: CrearElementoDto): Promise<ElementoAdminDto> {
    await this.exigirEspacioActivo(datos.espacioId);
    if (datos.placaInventario)
      await this.exigirPlacaLibre(datos.placaInventario);

    try {
      const fila = await this.prisma.elemento.create({
        data: {
          espacioId: datos.espacioId,
          nombre: datos.nombre.trim(),
          placaInventario: datos.placaInventario?.trim() || null,
          marca: datos.marca?.trim() || null,
          modelo: datos.modelo?.trim() || null,
          serie: datos.serie?.trim() || null,
          ...(datos.cantidad !== undefined ? { cantidad: datos.cantidad } : {}),
          ...(datos.unidad !== undefined
            ? { unidad: datos.unidad.trim() }
            : {}),
          ...(datos.estadoFisico !== undefined
            ? { estadoFisico: datos.estadoFisico }
            : {}),
          valorUnitario: datos.valorUnitario ?? null,
          fechaAdquisicion: fecha(datos.fechaAdquisicion) ?? null,
          vidaUtilMeses: datos.vidaUtilMeses ?? null,
          ...(datos.esPrestable !== undefined
            ? { esPrestable: datos.esPrestable }
            : {}),
        },
        include: incluir,
      });
      return aDto(fila);
    } catch (error) {
      if (esPlacaRepetida(error)) throw placaRepetida();
      throw error;
    }
  }

  async actualizar(
    id: string,
    datos: ActualizarElementoDto,
  ): Promise<ElementoAdminDto> {
    const actual = await this.prisma.elemento.findUnique({
      where: { id },
      select: { id: true, placaInventario: true },
    });
    if (!actual) throw noEncontrado('El elemento');
    if (datos.espacioId !== undefined)
      await this.exigirEspacioActivo(datos.espacioId);
    const placa =
      datos.placaInventario === undefined
        ? undefined
        : datos.placaInventario?.trim() || null;
    if (placa && placa !== actual.placaInventario)
      await this.exigirPlacaLibre(placa);

    try {
      const fila = await this.prisma.elemento.update({
        where: { id },
        data: {
          ...(datos.nombre !== undefined
            ? { nombre: datos.nombre.trim() }
            : {}),
          ...(datos.espacioId !== undefined
            ? { espacioId: datos.espacioId }
            : {}),
          ...(placa !== undefined ? { placaInventario: placa } : {}),
          ...(datos.marca !== undefined
            ? { marca: datos.marca?.trim() || null }
            : {}),
          ...(datos.modelo !== undefined
            ? { modelo: datos.modelo?.trim() || null }
            : {}),
          ...(datos.serie !== undefined
            ? { serie: datos.serie?.trim() || null }
            : {}),
          ...(datos.cantidad !== undefined ? { cantidad: datos.cantidad } : {}),
          ...(datos.unidad !== undefined
            ? { unidad: datos.unidad.trim() }
            : {}),
          ...(datos.estadoFisico !== undefined
            ? { estadoFisico: datos.estadoFisico }
            : {}),
          ...(datos.estado !== undefined ? { estado: datos.estado } : {}),
          ...(datos.valorUnitario !== undefined
            ? { valorUnitario: datos.valorUnitario }
            : {}),
          ...(datos.fechaAdquisicion !== undefined
            ? { fechaAdquisicion: fecha(datos.fechaAdquisicion) }
            : {}),
          ...(datos.vidaUtilMeses !== undefined
            ? { vidaUtilMeses: datos.vidaUtilMeses }
            : {}),
          ...(datos.esPrestable !== undefined
            ? { esPrestable: datos.esPrestable }
            : {}),
        },
        include: incluir,
      });
      return aDto(fila);
    } catch (error) {
      if (esPlacaRepetida(error)) throw placaRepetida();
      throw error;
    }
  }

  /** Nada se borra: dar de baja es cambiar el estado a DADO_DE_BAJA (queda el historial). */
  async darDeBaja(id: string): Promise<ElementoAdminDto> {
    const actual = await this.prisma.elemento.findUnique({
      where: { id },
      include: incluir,
    });
    if (!actual) throw noEncontrado('El elemento');
    if (actual.estado === 'DADO_DE_BAJA') return aDto(actual);
    const fila = await this.prisma.elemento.update({
      where: { id },
      data: { estado: 'DADO_DE_BAJA', esPrestable: false },
      include: incluir,
    });
    return aDto(fila);
  }

  private async exigirEspacioActivo(espacioId: string): Promise<void> {
    const espacio = await this.prisma.espacio.findUnique({
      where: { id: espacioId },
      select: { archivadoEn: true },
    });
    if (!espacio) throw noEncontrado('El espacio');
    if (espacio.archivadoEn) {
      throw new ErrorDominio(
        'ESPACIO_ARCHIVADO',
        'El espacio está archivado.',
        422,
      );
    }
  }

  private async exigirPlacaLibre(placa: string): Promise<void> {
    const otro = await this.prisma.elemento.findUnique({
      where: { placaInventario: placa },
      select: { id: true },
    });
    if (otro) throw placaRepetida();
  }
}
