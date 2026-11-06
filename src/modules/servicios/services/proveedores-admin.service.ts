import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { ErrorDominio, noEncontrado } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  ActualizarProveedorDto,
  CrearProveedorDto,
  FiltrosProveedoresDto,
  PaginaProveedoresDto,
  ProveedorAdminDto,
} from '../dto/admin.dto.js';

type FilaProveedor = Prisma.ProveedorGetPayload<{ include: { _count: { select: { servicios: true } } } }>;

const incluirConteo = {
  _count: { select: { servicios: { where: { activo: true } } } },
} satisfies Prisma.ProveedorInclude;

function aDto(fila: FilaProveedor): ProveedorAdminDto {
  return {
    id: fila.id,
    tipo: fila.tipo,
    nombre: fila.nombre,
    documento: fila.documento,
    contactoNombre: fila.contactoNombre,
    contactoCorreo: fila.contactoCorreo,
    contactoTelefono: fila.contactoTelefono,
    porcentajeAdministracion: Number(fila.porcentajeAdministracion.toString()),
    activo: fila.activo,
    serviciosActivos: fila._count.servicios,
  };
}

function nombreRepetido(): ErrorDominio {
  return new ErrorDominio('PROVEEDOR_DUPLICADO', 'Ya existe un proveedor con ese nombre.', 409);
}

@Injectable()
export class ProveedoresAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtros: FiltrosProveedoresDto): Promise<PaginaProveedoresDto> {
    const where: Prisma.ProveedorWhereInput = {
      ...(filtros.activo !== undefined ? { activo: filtros.activo } : {}),
      ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
      ...(filtros.buscar ? { nombre: { contains: filtros.buscar.trim(), mode: 'insensitive' } } : {}),
    };
    const [total, filas] = await Promise.all([
      this.prisma.proveedor.count({ where }),
      this.prisma.proveedor.findMany({
        where,
        orderBy: { nombre: 'asc' },
        skip: (filtros.pagina - 1) * filtros.porPagina,
        take: filtros.porPagina,
        include: incluirConteo,
      }),
    ]);
    return { datos: filas.map(aDto), total, pagina: filtros.pagina, porPagina: filtros.porPagina };
  }

  async obtener(id: string): Promise<ProveedorAdminDto> {
    const fila = await this.prisma.proveedor.findUnique({ where: { id }, include: incluirConteo });
    if (!fila) throw noEncontrado('El proveedor');
    return aDto(fila);
  }

  async crear(datos: CrearProveedorDto): Promise<ProveedorAdminDto> {
    const nombre = datos.nombre.trim();
    await this.verificarNombreLibre(nombre);
    const fila = await this.prisma.proveedor.create({
      data: {
        tipo: datos.tipo,
        nombre,
        documento: datos.documento?.trim() || null,
        contactoNombre: datos.contactoNombre?.trim() || null,
        contactoCorreo: datos.contactoCorreo?.trim().toLowerCase() || null,
        contactoTelefono: datos.contactoTelefono?.trim() || null,
        porcentajeAdministracion: datos.porcentajeAdministracion ?? 0,
      },
      include: incluirConteo,
    });
    return aDto(fila);
  }

  async actualizar(id: string, datos: ActualizarProveedorDto): Promise<ProveedorAdminDto> {
    const actual = await this.prisma.proveedor.findUnique({ where: { id }, select: { id: true, nombre: true } });
    if (!actual) throw noEncontrado('El proveedor');

    const nombre = datos.nombre?.trim();
    if (nombre !== undefined && nombre.toLowerCase() !== actual.nombre.toLowerCase()) {
      await this.verificarNombreLibre(nombre, id);
    }

    const data: Prisma.ProveedorUpdateInput = {
      ...(datos.tipo !== undefined ? { tipo: datos.tipo } : {}),
      ...(nombre !== undefined ? { nombre } : {}),
      ...(datos.documento !== undefined ? { documento: datos.documento.trim() || null } : {}),
      ...(datos.contactoNombre !== undefined ? { contactoNombre: datos.contactoNombre.trim() || null } : {}),
      ...(datos.contactoCorreo !== undefined
        ? { contactoCorreo: datos.contactoCorreo.trim().toLowerCase() || null }
        : {}),
      ...(datos.contactoTelefono !== undefined ? { contactoTelefono: datos.contactoTelefono.trim() || null } : {}),
      ...(datos.porcentajeAdministracion !== undefined
        ? { porcentajeAdministracion: datos.porcentajeAdministracion }
        : {}),
      ...(datos.activo !== undefined ? { activo: datos.activo } : {}),
    };

    const fila = await this.prisma.$transaction(async (tx) => {
      if (datos.activo === false) {
        await tx.servicioComplementario.updateMany({ where: { proveedorId: id }, data: { activo: false } });
      }
      return tx.proveedor.update({ where: { id }, data, include: incluirConteo });
    });
    return aDto(fila);
  }

  /** Nada se borra: el proveedor y todos sus servicios quedan inactivos en la misma transacción. */
  async desactivar(id: string): Promise<void> {
    const existe = await this.prisma.proveedor.findUnique({ where: { id }, select: { id: true } });
    if (!existe) throw noEncontrado('El proveedor');
    await this.prisma.$transaction(async (tx) => {
      await tx.servicioComplementario.updateMany({ where: { proveedorId: id }, data: { activo: false } });
      await tx.proveedor.update({ where: { id }, data: { activo: false } });
    });
  }

  private async verificarNombreLibre(nombre: string, excluirId?: string): Promise<void> {
    const existente = await this.prisma.proveedor.findFirst({
      where: {
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(excluirId ? { id: { not: excluirId } } : {}),
      },
      select: { id: true },
    });
    if (existente) throw nombreRepetido();
  }
}
