import { Injectable } from '@nestjs/common';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ErrorDominio, noEncontrado } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { fechaLocal } from '../../../shared/tiempo/zona-horaria.js';
import { TarifarioService } from '../../tarifario/services/tarifario.service.js';
import type {
  AgregarReservaDto,
  AgregarServicioDto,
  ReservaItemDto,
  ServicioItemDto,
} from '../dto/items.dto.js';
import { bloquearBorrador, SolicitudesService } from './solicitudes.service.js';

export const MAXIMO_RESERVAS_POR_SOLICITUD = 20;
/** Tope de un entero de PostgreSQL (int4) para los valores en pesos. */
const VALOR_MAXIMO_PESOS = 2_147_483_647;
export const MAXIMO_SERVICIOS_POR_SOLICITUD = 30;

function dosDecimales(valor: number): number {
  return Math.round(valor * 100) / 100;
}

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly solicitudes: SolicitudesService,
    private readonly tarifario: TarifarioService,
  ) {}

  async agregarReserva(
    solicitudId: string,
    datos: AgregarReservaDto,
    usuario: UsuarioAutenticado,
  ): Promise<ReservaItemDto> {
    const solicitud = await this.solicitudes.borradorPropio(solicitudId, usuario);
    const inicio = new Date(datos.inicio);
    const fin = new Date(datos.fin);
    if (fin <= inicio) {
      throw new ErrorDominio('RANGO_INVALIDO', 'La hora de fin debe ser posterior a la de inicio.', 400);
    }
    if (fechaLocal(inicio) !== fechaLocal(new Date(fin.getTime() - 1))) {
      throw new ErrorDominio(
        'RANGO_INVALIDO',
        'Cada reserva debe terminar el mismo día en que empieza. Agrega una reserva por día.',
        400,
      );
    }
    if (inicio <= new Date()) {
      throw new ErrorDominio('RANGO_INVALIDO', 'La reserva debe empezar en el futuro.', 400);
    }

    const espacio = await this.prisma.espacio.findFirst({
      where: { id: datos.espacioId, archivadoEn: null, esReservable: true, estado: { not: 'FUERA_DE_SERVICIO' } },
      select: { id: true },
    });
    if (!espacio) throw noEncontrado('El espacio');

    const estimado = await this.tarifario.calcular(
      { espacioId: espacio.id, tipoSolicitante: solicitud.tipoTarifa, inicio, fin },
      new Date(),
    );
    const cantidad = estimado.lineas.reduce((suma, l) => suma + l.cantidad, 0);
    const unidades = new Set(estimado.lineas.map((l) => l.unidad));
    const unidad = unidades.size === 1 ? [...unidades][0]! : null;

    const fila = await this.prisma.$transaction(async (tx) => {
      await bloquearBorrador(tx, solicitudId);
      const existentes = await tx.reservaItem.findMany({
        where: { solicitudId },
        select: { espacioId: true, inicio: true, fin: true },
      });
      if (existentes.length >= MAXIMO_RESERVAS_POR_SOLICITUD) {
        throw new ErrorDominio(
          'LIMITE_DE_ITEMS',
          `Una solicitud admite máximo ${MAXIMO_RESERVAS_POR_SOLICITUD} reservas.`,
          422,
        );
      }
      if (existentes.some((e) => e.espacioId === espacio.id && e.inicio < fin && e.fin > inicio)) {
        throw new ErrorDominio(
          'RESERVA_DUPLICADA',
          'Ya agregaste este espacio en un horario que se cruza con el indicado.',
          409,
        );
      }
      return tx.reservaItem.create({
        data: {
          solicitudId,
          espacioId: espacio.id,
          inicio,
          fin,
          unidad: unidad && unidad !== 'JORNADAS' ? unidad : null,
          cantidad: dosDecimales(cantidad),
          valorUnitario: cantidad > 0 ? Math.round(estimado.base / cantidad) : 0,
          recargos: estimado.recargos,
          subtotal: estimado.subtotal,
        },
      });
    });
    return {
      id: fila.id,
      espacioId: fila.espacioId,
      inicio: fila.inicio.toISOString(),
      fin: fila.fin.toISOString(),
      unidad: fila.unidad,
      cantidad: Number(fila.cantidad.toString()),
      valorUnitario: fila.valorUnitario,
      recargos: fila.recargos,
      subtotal: fila.subtotal,
    };
  }

  async quitarReserva(solicitudId: string, itemId: string, usuario: UsuarioAutenticado): Promise<void> {
    await this.solicitudes.borradorPropio(solicitudId, usuario);
    await this.prisma.$transaction(async (tx) => {
      await bloquearBorrador(tx, solicitudId);
      const { count } = await tx.reservaItem.deleteMany({ where: { id: itemId, solicitudId } });
      if (count === 0) throw noEncontrado('La reserva');
    });
  }

  async agregarServicio(
    solicitudId: string,
    datos: AgregarServicioDto,
    usuario: UsuarioAutenticado,
  ): Promise<ServicioItemDto> {
    const solicitud = await this.solicitudes.borradorPropio(solicitudId, usuario);
    const servicio = await this.prisma.servicioComplementario.findFirst({
      where: { id: datos.servicioId, activo: true, proveedor: { activo: true } },
      select: { id: true, nombre: true, cantidadMaxima: true },
    });
    if (!servicio) throw noEncontrado('El servicio');
    if (servicio.cantidadMaxima !== null && datos.cantidad > servicio.cantidadMaxima) {
      throw new ErrorDominio(
        'CANTIDAD_EXCEDIDA',
        `Este servicio admite máximo ${servicio.cantidadMaxima} por solicitud.`,
        422,
      );
    }

    const hoy = new Date(`${fechaLocal(new Date())}T00:00:00.000Z`);
    const tarifa = await this.prisma.tarifa.findFirst({
      where: {
        servicioId: servicio.id,
        tipoSolicitante: solicitud.tipoTarifa,
        vigenciaDesde: { lte: hoy },
        OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: hoy } }],
      },
      orderBy: { vigenciaDesde: 'desc' },
      select: { valor: true },
    });
    const valorUnitario = tarifa?.valor ?? 0;

    const subtotal = valorUnitario * datos.cantidad;
    if (subtotal > VALOR_MAXIMO_PESOS) {
      throw new ErrorDominio(
        'VALOR_EXCEDIDO',
        'El valor del servicio por la cantidad solicitada supera el máximo permitido. Reduce la cantidad.',
        422,
      );
    }

    const fila = await this.prisma.$transaction(async (tx) => {
      await bloquearBorrador(tx, solicitudId);
      const existentes = await tx.servicioItem.findMany({
        where: { solicitudId },
        select: { servicioId: true },
      });
      if (existentes.length >= MAXIMO_SERVICIOS_POR_SOLICITUD) {
        throw new ErrorDominio(
          'LIMITE_DE_ITEMS',
          `Una solicitud admite máximo ${MAXIMO_SERVICIOS_POR_SOLICITUD} servicios.`,
          422,
        );
      }
      if (existentes.some((e) => e.servicioId === servicio.id)) {
        throw new ErrorDominio(
          'SERVICIO_DUPLICADO',
          'Este servicio ya está en tu solicitud. Quítalo y vuelve a agregarlo con otra cantidad.',
          409,
        );
      }
      return tx.servicioItem.create({
        data: {
          solicitudId,
          servicioId: servicio.id,
          cantidad: datos.cantidad,
          valorUnitario,
          subtotal,
          observaciones: datos.observaciones ?? null,
        },
      });
    });
    return {
      id: fila.id,
      servicioId: fila.servicioId,
      nombre: servicio.nombre,
      cantidad: fila.cantidad,
      valorUnitario: fila.valorUnitario,
      subtotal: fila.subtotal,
      estadoConfirmacion: fila.estadoConfirmacion,
      observaciones: fila.observaciones,
    };
  }

  async quitarServicio(solicitudId: string, itemId: string, usuario: UsuarioAutenticado): Promise<void> {
    await this.solicitudes.borradorPropio(solicitudId, usuario);
    await this.prisma.$transaction(async (tx) => {
      await bloquearBorrador(tx, solicitudId);
      const { count } = await tx.servicioItem.deleteMany({ where: { id: itemId, solicitudId } });
      if (count === 0) throw noEncontrado('El servicio');
    });
  }
}
