import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { ErrorDominio, noEncontrado } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  ActualizarServicioDto,
  CrearServicioDto,
  FiltrosServiciosAdminDto,
  PaginaServiciosAdminDto,
  ServicioAdminDto,
} from '../dto/admin.dto.js';

const incluirDetalle = {
  proveedor: { select: { id: true, nombre: true } },
  tiposPermitidos: { select: { id: true, codigo: true, nombre: true }, orderBy: { nombre: 'asc' } },
} satisfies Prisma.ServicioComplementarioInclude;

type FilaServicio = Prisma.ServicioComplementarioGetPayload<{ include: typeof incluirDetalle }>;

function aDto(fila: FilaServicio): ServicioAdminDto {
  return {
    id: fila.id,
    proveedor: { id: fila.proveedor.id, nombre: fila.proveedor.nombre },
    nombre: fila.nombre,
    categoria: fila.categoria,
    descripcion: fila.descripcion,
    unidadCobro: fila.unidadCobro,
    requiereConfirmacion: fila.requiereConfirmacion,
    anticipacionMinimaDias: fila.anticipacionMinimaDias,
    cantidadMaxima: fila.cantidadMaxima,
    activo: fila.activo,
    tiposPermitidos: fila.tiposPermitidos.map((t) => ({ id: t.id, codigo: t.codigo, nombre: t.nombre })),
  };
}

@Injectable()
export class ServiciosAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtros: FiltrosServiciosAdminDto): Promise<PaginaServiciosAdminDto> {
    const where: Prisma.ServicioComplementarioWhereInput = {
      ...(filtros.activo !== undefined ? { activo: filtros.activo } : {}),
      ...(filtros.categoria ? { categoria: filtros.categoria } : {}),
      ...(filtros.proveedorId ? { proveedorId: filtros.proveedorId } : {}),
      ...(filtros.buscar ? { nombre: { contains: filtros.buscar.trim(), mode: 'insensitive' } } : {}),
    };
    const [total, filas] = await Promise.all([
      this.prisma.servicioComplementario.count({ where }),
      this.prisma.servicioComplementario.findMany({
        where,
        orderBy: [{ categoria: 'asc' }, { nombre: 'asc' }],
        skip: (filtros.pagina - 1) * filtros.porPagina,
        take: filtros.porPagina,
        include: incluirDetalle,
      }),
    ]);
    return { datos: filas.map(aDto), total, pagina: filtros.pagina, porPagina: filtros.porPagina };
  }

  async obtener(id: string): Promise<ServicioAdminDto> {
    const fila = await this.prisma.servicioComplementario.findUnique({ where: { id }, include: incluirDetalle });
    if (!fila) throw noEncontrado('El servicio');
    return aDto(fila);
  }

  async crear(datos: CrearServicioDto): Promise<ServicioAdminDto> {
    await this.exigirProveedorActivo(datos.proveedorId);
    const nombre = datos.nombre.trim();
    await this.verificarNombreLibre(datos.proveedorId, nombre);
    const tipos = await this.validarTipos(datos.tiposPermitidos ?? []);

    const fila = await this.prisma.servicioComplementario.create({
      data: {
        proveedorId: datos.proveedorId,
        nombre,
        categoria: datos.categoria,
        descripcion: datos.descripcion?.trim() || null,
        unidadCobro: datos.unidadCobro,
        requiereConfirmacion: datos.requiereConfirmacion ?? true,
        anticipacionMinimaDias: datos.anticipacionMinimaDias ?? 3,
        cantidadMaxima: datos.cantidadMaxima ?? null,
        tiposPermitidos: { connect: tipos.map((id) => ({ id })) },
      },
      include: incluirDetalle,
    });
    return aDto(fila);
  }

  async actualizar(id: string, datos: ActualizarServicioDto): Promise<ServicioAdminDto> {
    const actual = await this.prisma.servicioComplementario.findUnique({
      where: { id },
      select: { id: true, nombre: true, proveedorId: true },
    });
    if (!actual) throw noEncontrado('El servicio');

    const proveedorId = datos.proveedorId ?? actual.proveedorId;
    const nombre = datos.nombre?.trim() ?? actual.nombre;
    if (datos.proveedorId !== undefined && datos.proveedorId !== actual.proveedorId) {
      await this.exigirProveedorActivo(datos.proveedorId);
    }
    if (datos.activo === true) await this.exigirProveedorActivo(proveedorId);
    if (proveedorId !== actual.proveedorId || nombre.toLowerCase() !== actual.nombre.toLowerCase()) {
      await this.verificarNombreLibre(proveedorId, nombre, id);
    }
    const tipos = datos.tiposPermitidos ? await this.validarTipos(datos.tiposPermitidos) : null;

    const fila = await this.prisma.servicioComplementario.update({
      where: { id },
      data: {
        ...(datos.proveedorId !== undefined ? { proveedorId: datos.proveedorId } : {}),
        ...(datos.nombre !== undefined ? { nombre } : {}),
        ...(datos.categoria !== undefined ? { categoria: datos.categoria } : {}),
        ...(datos.descripcion !== undefined ? { descripcion: datos.descripcion.trim() || null } : {}),
        ...(datos.unidadCobro !== undefined ? { unidadCobro: datos.unidadCobro } : {}),
        ...(datos.requiereConfirmacion !== undefined ? { requiereConfirmacion: datos.requiereConfirmacion } : {}),
        ...(datos.anticipacionMinimaDias !== undefined
          ? { anticipacionMinimaDias: datos.anticipacionMinimaDias }
          : {}),
        ...(datos.cantidadMaxima !== undefined ? { cantidadMaxima: datos.cantidadMaxima } : {}),
        ...(datos.activo !== undefined ? { activo: datos.activo } : {}),
        ...(tipos ? { tiposPermitidos: { set: tipos.map((tipoId) => ({ id: tipoId })) } } : {}),
      },
      include: incluirDetalle,
    });
    return aDto(fila);
  }

  /** Nada se borra: las solicitudes ya hechas conservan el servicio con el que se cotizaron. */
  async desactivar(id: string): Promise<void> {
    const { count } = await this.prisma.servicioComplementario.updateMany({
      where: { id },
      data: { activo: false },
    });
    if (count === 0) throw noEncontrado('El servicio');
  }

  private async exigirProveedorActivo(proveedorId: string): Promise<void> {
    const proveedor = await this.prisma.proveedor.findUnique({
      where: { id: proveedorId },
      select: { activo: true },
    });
    if (!proveedor) throw noEncontrado('El proveedor');
    if (!proveedor.activo) {
      throw new ErrorDominio(
        'PROVEEDOR_INACTIVO',
        'El proveedor está inactivo. Reactívalo antes de asignarle servicios.',
        422,
      );
    }
  }

  private async verificarNombreLibre(proveedorId: string, nombre: string, excluirId?: string): Promise<void> {
    const existente = await this.prisma.servicioComplementario.findFirst({
      where: {
        proveedorId,
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(excluirId ? { id: { not: excluirId } } : {}),
      },
      select: { id: true },
    });
    if (existente) {
      throw new ErrorDominio(
        'SERVICIO_DUPLICADO',
        'Este proveedor ya tiene un servicio con ese nombre.',
        409,
      );
    }
  }

  private async validarTipos(ids: string[]): Promise<string[]> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return [];
    const existentes = await this.prisma.tipoEspacio.findMany({
      where: { id: { in: unicos }, activo: true },
      select: { id: true },
    });
    if (existentes.length !== unicos.length) {
      throw new ErrorDominio(
        'TIPO_ESPACIO_INVALIDO',
        'Alguno de los tipos de espacio indicados no existe o está inactivo.',
        422,
      );
    }
    return unicos;
  }
}
