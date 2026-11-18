import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { ServicioDto } from '../dto/servicios.dto.js';

@Injectable()
export class ServiciosService {
  constructor(private readonly prisma: PrismaService) {}

  /** Catálogo público: sin datos del proveedor (contacto, documento, porcentaje). */
  async listar(tipoEspacioId?: string): Promise<ServicioDto[]> {
    const where: Prisma.ServicioComplementarioWhereInput = {
      activo: true,
      proveedor: { activo: true },
      ...(tipoEspacioId
        ? { OR: [{ tiposPermitidos: { none: {} } }, { tiposPermitidos: { some: { id: tipoEspacioId } } }] }
        : {}),
    };
    const filas = await this.prisma.servicioComplementario.findMany({
      where,
      orderBy: [{ categoria: 'asc' }, { nombre: 'asc' }],
      select: {
        id: true,
        nombre: true,
        categoria: true,
        descripcion: true,
        unidadCobro: true,
        requiereConfirmacion: true,
        anticipacionMinimaDias: true,
        cantidadMaxima: true,
      },
    });
    return filas;
  }
}
