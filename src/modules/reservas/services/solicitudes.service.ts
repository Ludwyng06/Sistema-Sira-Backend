import { Injectable } from '@nestjs/common';
import { EstadoSolicitud, Rol } from '../../../generated/prisma/enums.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ErrorDominio, noEncontrado } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  ActualizarSolicitudDto,
  CrearSolicitudDto,
  FiltrosSolicitudesDto,
  PaginaSolicitudesDto,
  SolicitudDetalleDto,
  SolicitudDto,
} from '../dto/solicitud.dto.js';

type FilaSolicitud = Prisma.SolicitudGetPayload<Record<string, never>>;

const ROLES_CON_LECTURA_GLOBAL: Rol[] = [Rol.ADMINISTRADOR, Rol.AUDITOR, Rol.TESORERIA];

export function aDto(fila: FilaSolicitud): SolicitudDto {
  return {
    id: fila.id,
    consecutivo: fila.consecutivo,
    estado: fila.estado,
    objetoEvento: fila.objetoEvento,
    descripcion: fila.descripcion,
    asistentesEstimados: fila.asistentesEstimados,
    responsableEnSitio: fila.responsableEnSitio,
    telefonoContacto: fila.telefonoContacto,
    eventoPublico: fila.eventoPublico,
    declaraUsoInstitucional: fila.declaraUsoInstitucional,
    esExenta: fila.esExenta,
    tipoTarifa: fila.tipoTarifa,
    dependenciaId: fila.dependenciaId,
    enviadaEn: fila.enviadaEn?.toISOString() ?? null,
    venceEn: fila.venceEn?.toISOString() ?? null,
    creadoEn: fila.creadoEn.toISOString(),
    actualizadoEn: fila.actualizadoEn.toISOString(),
  };
}

type FilaDetalle = Prisma.SolicitudGetPayload<{
  include: {
    reservas: true;
    servicios: { include: { servicio: { select: { nombre: true } } } };
    decisiones: true;
    cotizaciones: true;
  };
}>;

function aDetalle(fila: FilaDetalle): SolicitudDetalleDto {
  const cotizacion = fila.cotizaciones[0];
  return {
    ...aDto(fila),
    reservas: fila.reservas.map((r) => ({
      id: r.id,
      espacioId: r.espacioId,
      inicio: r.inicio.toISOString(),
      fin: r.fin.toISOString(),
      unidad: r.unidad,
      cantidad: Number(r.cantidad.toString()),
      valorUnitario: r.valorUnitario,
      recargos: r.recargos,
      subtotal: r.subtotal,
    })),
    servicios: fila.servicios.map((s) => ({
      id: s.id,
      servicioId: s.servicioId,
      nombre: s.servicio.nombre,
      cantidad: s.cantidad,
      valorUnitario: s.valorUnitario,
      subtotal: s.subtotal,
      estadoConfirmacion: s.estadoConfirmacion,
      observaciones: s.observaciones,
    })),
    decisiones: fila.decisiones.map((d) => ({
      tipo: d.tipo,
      resultado: d.resultado,
      motivo: d.motivo,
      decididaEn: d.decididaEn.toISOString(),
    })),
    cotizacion: cotizacion
      ? {
          consecutivo: cotizacion.consecutivo,
          subtotal: cotizacion.subtotal,
          iva: cotizacion.iva,
          total: cotizacion.total,
          depositoGarantia: cotizacion.depositoGarantia,
          valorReferencia: cotizacion.valorReferencia,
          validaHasta: cotizacion.validaHasta.toISOString(),
        }
      : null,
  };
}

/**
 * Guarda atómica de edición: bloquea la fila de la solicitud hasta el commit y falla si ya no es un
 * borrador. Sirve para que ítems, documentos y envío no se pisen entre peticiones simultáneas.
 */
export async function bloquearBorrador(tx: Prisma.TransactionClient, solicitudId: string): Promise<void> {
  const { count } = await tx.solicitud.updateMany({
    where: { id: solicitudId, estado: EstadoSolicitud.BORRADOR },
    data: { actualizadoEn: new Date() },
  });
  if (count === 0) {
    throw new ErrorDominio(
      'SOLICITUD_NO_EDITABLE',
      'Solo puedes modificar una solicitud mientras es un borrador.',
      409,
    );
  }
}

@Injectable()
export class SolicitudesService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(datos: CrearSolicitudDto, usuario: UsuarioAutenticado): Promise<SolicitudDto> {
    const solicitante = await this.perfilDe(usuario);
    this.validarUsoInstitucional(datos.declaraUsoInstitucional, usuario);

    const fila = await this.prisma.$transaction(async (tx) => {
      const creada = await tx.solicitud.create({
        data: {
          solicitanteId: solicitante.id,
          dependenciaId: solicitante.dependenciaId,
          tipoTarifa: solicitante.tipo,
          objetoEvento: datos.objetoEvento.trim(),
          descripcion: datos.descripcion ?? null,
          asistentesEstimados: datos.asistentesEstimados,
          responsableEnSitio: datos.responsableEnSitio ?? null,
          telefonoContacto: datos.telefonoContacto ?? null,
          eventoPublico: datos.eventoPublico ?? false,
          declaraUsoInstitucional: datos.declaraUsoInstitucional ?? false,
        },
      });
      await tx.historialEstadoSolicitud.create({
        data: {
          solicitudId: creada.id,
          estadoAnterior: null,
          estadoNuevo: EstadoSolicitud.BORRADOR,
          usuarioId: usuario.id,
        },
      });
      return creada;
    });
    return aDto(fila);
  }

  async obtener(id: string, usuario: UsuarioAutenticado): Promise<SolicitudDetalleDto> {
    const alternativas = await this.alternativasVisibles(usuario);
    if (alternativas.length === 0) throw noEncontrado('La solicitud');

    const fila = await this.prisma.solicitud.findFirst({
      where: { id, OR: alternativas },
      include: {
        reservas: { orderBy: { inicio: 'asc' } },
        servicios: { include: { servicio: { select: { nombre: true } } } },
        decisiones: { orderBy: { decididaEn: 'asc' } },
        cotizaciones: { orderBy: { creadaEn: 'desc' }, take: 1 },
      },
    });
    if (!fila) throw noEncontrado('La solicitud');
    return aDetalle(fila);
  }

  /** 404 si la solicitud no existe o está fuera del alcance del usuario (dueño o bandeja por rol). */
  async asegurarVisible(id: string, usuario: UsuarioAutenticado): Promise<void> {
    const alternativas = await this.alternativasVisibles(usuario);
    if (alternativas.length === 0) throw noEncontrado('La solicitud');
    const fila = await this.prisma.solicitud.findFirst({ where: { id, OR: alternativas }, select: { id: true } });
    if (!fila) throw noEncontrado('La solicitud');
  }

  private async alternativasVisibles(usuario: UsuarioAutenticado): Promise<Prisma.SolicitudWhereInput[]> {
    const perfil = await this.perfilOpcional(usuario);
    const alternativas: Prisma.SolicitudWhereInput[] = [];
    if (perfil) alternativas.push({ solicitanteId: perfil.id });
    const bandeja = this.alcanceBandeja(usuario);
    if (bandeja) alternativas.push(bandeja);
    return alternativas;
  }

  async listar(filtros: FiltrosSolicitudesDto, usuario: UsuarioAutenticado): Promise<PaginaSolicitudesDto> {
    let base: Prisma.SolicitudWhereInput;
    if (filtros.ambito === 'BANDEJA') {
      const bandeja = this.alcanceBandeja(usuario);
      if (!bandeja) {
        throw new ErrorDominio('SIN_BANDEJA', 'Tu rol no tiene solicitudes por revisar.', 403);
      }
      base = bandeja;
    } else {
      base = { solicitanteId: (await this.perfilDe(usuario)).id };
    }
    const where: Prisma.SolicitudWhereInput = {
      ...base,
      ...(filtros.estado ? { estado: filtros.estado } : {}),
    };
    const [total, filas] = await Promise.all([
      this.prisma.solicitud.count({ where }),
      this.prisma.solicitud.findMany({
        where,
        orderBy: { creadoEn: 'desc' },
        skip: (filtros.pagina - 1) * filtros.porPagina,
        take: filtros.porPagina,
      }),
    ]);
    return { datos: filas.map(aDto), total, pagina: filtros.pagina, porPagina: filtros.porPagina };
  }

  async actualizar(
    id: string,
    datos: ActualizarSolicitudDto,
    usuario: UsuarioAutenticado,
  ): Promise<SolicitudDto> {
    await this.borradorPropio(id, usuario);
    this.validarUsoInstitucional(datos.declaraUsoInstitucional, usuario);

    const fila = await this.prisma.solicitud.update({
      where: { id },
      data: {
        ...(datos.objetoEvento !== undefined ? { objetoEvento: datos.objetoEvento.trim() } : {}),
        ...(datos.descripcion !== undefined ? { descripcion: datos.descripcion } : {}),
        ...(datos.asistentesEstimados !== undefined ? { asistentesEstimados: datos.asistentesEstimados } : {}),
        ...(datos.responsableEnSitio !== undefined ? { responsableEnSitio: datos.responsableEnSitio } : {}),
        ...(datos.telefonoContacto !== undefined ? { telefonoContacto: datos.telefonoContacto } : {}),
        ...(datos.eventoPublico !== undefined ? { eventoPublico: datos.eventoPublico } : {}),
        ...(datos.declaraUsoInstitucional !== undefined
          ? { declaraUsoInstitucional: datos.declaraUsoInstitucional }
          : {}),
      },
    });
    return aDto(fila);
  }

  /** Solicitud del usuario en BORRADOR; ajena o inexistente = 404, otro estado = 409. */
  async borradorPropio(id: string, usuario: UsuarioAutenticado): Promise<FilaSolicitud> {
    const solicitante = await this.perfilDe(usuario);
    const actual = await this.prisma.solicitud.findFirst({ where: { id, solicitanteId: solicitante.id } });
    if (!actual) throw noEncontrado('La solicitud');
    if (actual.estado !== EstadoSolicitud.BORRADOR) {
      throw new ErrorDominio(
        'SOLICITUD_NO_EDITABLE',
        'Solo puedes modificar una solicitud mientras es un borrador.',
        409,
      );
    }
    return actual;
  }

  /**
   * Solicitudes que el usuario debe revisar por su rol (nunca borradores ajenos).
   * Null si ningún rol suyo tiene bandeja.
   */
  private alcanceBandeja(usuario: UsuarioAutenticado): Prisma.SolicitudWhereInput | null {
    const noBorrador: Prisma.SolicitudWhereInput = { estado: { not: EstadoSolicitud.BORRADOR } };
    if (usuario.roles.some((rol) => ROLES_CON_LECTURA_GLOBAL.includes(rol))) return noBorrador;

    const alternativas: Prisma.SolicitudWhereInput[] = [];
    if (usuario.roles.includes(Rol.RESPONSABLE_ESPACIO)) {
      alternativas.push({ reservas: { some: { espacio: { responsableId: usuario.id } } } });
    }
    if (usuario.roles.includes(Rol.APROBADOR) && usuario.dependencias.length > 0) {
      alternativas.push({
        reservas: { some: { espacio: { dependenciaId: { in: usuario.dependencias } } } },
      });
    }
    if (alternativas.length === 0) return null;
    return { AND: [noBorrador, { OR: alternativas }] };
  }

  private validarUsoInstitucional(declara: boolean | undefined, usuario: UsuarioAutenticado): void {
    if (declara === true && !usuario.esInstitucional) {
      throw new ErrorDominio(
        'USO_INSTITUCIONAL_NO_PERMITIDO',
        'Solo las cuentas con correo institucional pueden declarar uso institucional.',
        422,
      );
    }
  }

  private perfilOpcional(usuario: UsuarioAutenticado) {
    return this.prisma.solicitante.findUnique({
      where: { usuarioId: usuario.id },
      select: { id: true, tipo: true, dependenciaId: true },
    });
  }

  private async perfilDe(usuario: UsuarioAutenticado) {
    const solicitante = await this.perfilOpcional(usuario);
    if (!solicitante) {
      throw new ErrorDominio(
        'PERFIL_INCOMPLETO',
        'Completa tu perfil de solicitante antes de crear solicitudes.',
        422,
      );
    }
    return solicitante;
  }
}
