import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../../generated/prisma/client.js';
import { EstadoOrdenPago, EstadoSolicitud, MedioPago } from '../../../generated/prisma/enums.js';
import { ALMACENAMIENTO, type AlmacenamientoPort } from '../../../shared/almacenamiento/almacenamiento.port.js';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ConsecutivoService } from '../../../shared/consecutivos/consecutivo.service.js';
import { ErrorDominio, noEncontrado } from '../../../shared/errores/error-dominio.js';
import { ParametroService } from '../../../shared/parametros/parametro.service.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { NotificacionesService } from '../../notificaciones/services/notificaciones.service.js';
import { detectarTipoMime, EXTENSION_POR_TIPO } from '../../reservas/dominio/contenido-archivo.js';
import { transicionOConflicto } from '../../reservas/dominio/maquina-estados.js';
import type {
  CuentaRecaudoDto,
  FiltrosOrdenesDto,
  OrdenPagoDto,
  OrdenPagoResumenDto,
  PagoTardioDto,
  PaginaOrdenesDto,
  RegistrarPagoTardioDto,
  VerificacionDto,
  VerificarPagoDto,
} from '../dto/pago.dto.js';

export const TAMANO_MAXIMO_SOPORTE = 10 * 1024 * 1024;

export interface ContextoPago {
  ip: string | null;
  userAgent: string | null;
  correlacionId: string | null;
}

export interface SoporteSubido {
  size: number;
  buffer: Buffer;
}

export interface SoporteDescargable {
  contenido: Buffer;
  tipoMime: string;
  nombre: string;
}

const ESTADOS_ACTIVOS: EstadoOrdenPago[] = [
  EstadoOrdenPago.PENDIENTE,
  EstadoOrdenPago.EN_VERIFICACION,
  EstadoOrdenPago.APROBADA,
];

function leerCuenta(valor: unknown): CuentaRecaudoDto {
  const c = valor as Record<string, unknown> | null;
  const campos = ['banco', 'tipo', 'numero', 'titular', 'nit'] as const;
  if (!c || typeof c !== 'object' || !campos.every((campo) => typeof c[campo] === 'string')) {
    throw new Error('El parámetro "cuenta_recaudo" debe tener banco, tipo, numero, titular y nit.');
  }
  return {
    banco: c.banco as string,
    tipo: c.tipo as string,
    numero: c.numero as string,
    titular: c.titular as string,
    nit: c.nit as string,
  };
}

type FilaOrden = Prisma.OrdenPagoGetPayload<Record<string, never>>;

@Injectable()
export class PagosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consecutivos: ConsecutivoService,
    private readonly parametros: ParametroService,
    @Inject(ALMACENAMIENTO) private readonly almacenamiento: AlmacenamientoPort,
    private readonly notificaciones: NotificacionesService,
  ) {}

  /** UC-03 paso 1. RN-08: una solicitud exenta no tiene pago. */
  async crearOrden(solicitudId: string, usuario: UsuarioAutenticado, contexto: ContextoPago): Promise<OrdenPagoDto> {
    const perfil = await this.prisma.solicitante.findUnique({
      where: { usuarioId: usuario.id },
      select: { id: true },
    });
    const solicitud = perfil
      ? await this.prisma.solicitud.findFirst({
          where: { id: solicitudId, solicitanteId: perfil.id },
          include: { cotizaciones: { orderBy: { creadaEn: 'desc' }, take: 1 } },
        })
      : null;
    if (!solicitud) throw noEncontrado('La solicitud');

    if (solicitud.esExenta) {
      throw new ErrorDominio('SOLICITUD_EXENTA', 'Esta solicitud es exenta: no requiere pago.', 422);
    }
    if (
      solicitud.estado !== EstadoSolicitud.COTIZADA &&
      solicitud.estado !== EstadoSolicitud.PAGO_PENDIENTE
    ) {
      throw new ErrorDominio(
        'ORDEN_NO_PERMITIDA',
        'Solo puedes generar la orden de pago de una solicitud cotizada.',
        409,
      );
    }
    const cotizacion = solicitud.cotizaciones[0];
    const ahora = new Date();
    if (!cotizacion || cotizacion.validaHasta <= ahora) {
      throw new ErrorDominio('COTIZACION_VENCIDA', 'La cotización venció. Solicita una nueva.', 409);
    }

    const cuenta = leerCuenta(await this.parametros.obtenerJson('cuenta_recaudo'));
    const activa = await this.prisma.ordenPago.findFirst({
      where: { cotizacionId: cotizacion.id, estado: { in: ESTADOS_ACTIVOS } },
      orderBy: { creadaEn: 'desc' },
    });
    if (activa) {
      if (activa.estado === EstadoOrdenPago.PENDIENTE) return this.aDto(activa, cuenta);
      throw new ErrorDominio(
        'ORDEN_NO_PERMITIDA',
        'Ya tienes una orden de pago en verificación o aprobada para esta solicitud.',
        409,
      );
    }

    const valor = cotizacion.total + cotizacion.depositoGarantia;
    if (valor <= 0) {
      throw new ErrorDominio(
        'ORDEN_SIN_VALOR',
        'Esta solicitud no tiene un valor a pagar. Comunícate con la administración.',
        422,
      );
    }
    const orden = await this.prisma.$transaction(async (tx) => {
      // Guarda de concurrencia: la fila de la solicitud se bloquea hasta el commit, así que dos
      // peticiones simultáneas no pueden crear dos órdenes de la misma cotización.
      const destino =
        solicitud.estado === EstadoSolicitud.COTIZADA
          ? transicionOConflicto(solicitud.estado, 'GENERAR_ORDEN_PAGO')
          : solicitud.estado;
      const { count } = await tx.solicitud.updateMany({
        where: { id: solicitudId, estado: solicitud.estado },
        data: { estado: destino },
      });
      const concurrente = await tx.ordenPago.findFirst({
        where: { cotizacionId: cotizacion.id, estado: { in: ESTADOS_ACTIVOS } },
        orderBy: { creadaEn: 'desc' },
      });
      if (count === 0 || concurrente) {
        if (concurrente?.estado === EstadoOrdenPago.PENDIENTE) return concurrente;
        throw new ErrorDominio(
          'ORDEN_NO_PERMITIDA',
          'La solicitud cambió de estado o ya tiene una orden de pago en curso. Actualiza e intenta de nuevo.',
          409,
        );
      }
      const referencia = await this.consecutivos.siguiente(tx, 'ORDEN_PAGO');
      const creada = await tx.ordenPago.create({
        data: {
          referencia,
          cotizacionId: cotizacion.id,
          valor,
          medio: MedioPago.CONSIGNACION,
          venceEn: cotizacion.validaHasta,
        },
      });
      if (solicitud.estado === EstadoSolicitud.COTIZADA) {
        await tx.historialEstadoSolicitud.create({
          data: {
            solicitudId,
            estadoAnterior: solicitud.estado,
            estadoNuevo: destino,
            usuarioId: usuario.id,
            observacion: referencia,
          },
        });
      }
      await tx.bitacora.create({
        data: {
          usuarioId: usuario.id,
          accion: 'ORDEN_PAGO_CREADA',
          entidad: 'OrdenPago',
          entidadId: creada.id,
          ip: contexto.ip,
          userAgent: contexto.userAgent,
          correlacionId: contexto.correlacionId,
          datosDespues: { referencia, valor, solicitudId },
        },
      });
      return creada;
    });
    return this.aDto(orden, cuenta);
  }

  /** UC-03 paso 2: el solicitante carga el comprobante y la orden pasa a verificación. */
  async cargarSoporte(
    ordenId: string,
    archivo: SoporteSubido | undefined,
    usuario: UsuarioAutenticado,
    contexto: ContextoPago,
  ): Promise<OrdenPagoDto> {
    const orden = await this.ordenPropia(ordenId, usuario);
    if (orden.estado !== EstadoOrdenPago.PENDIENTE) {
      throw new ErrorDominio(
        'ORDEN_NO_PERMITIDA',
        'Solo puedes cargar el soporte de una orden pendiente.',
        409,
      );
    }
    if (orden.venceEn <= new Date()) {
      throw new ErrorDominio('ORDEN_VENCIDA', 'La orden de pago venció. Genera una nueva.', 409);
    }
    if (!archivo || archivo.size === 0) {
      throw new ErrorDominio('ARCHIVO_REQUERIDO', 'Adjunta el comprobante de la consignación.', 422);
    }
    if (archivo.size > TAMANO_MAXIMO_SOPORTE) {
      throw new ErrorDominio('ARCHIVO_MUY_GRANDE', 'El archivo no puede superar 10 MB.', 422);
    }
    const tipoMime = detectarTipoMime(archivo.buffer);
    if (!tipoMime) {
      throw new ErrorDominio('ARCHIVO_NO_PERMITIDO', 'Solo se aceptan archivos PDF, PNG o JPG.', 422);
    }

    const clave = `pagos/${orden.id}/${randomUUID()}.${EXTENSION_POR_TIPO[tipoMime]}`;
    await this.almacenamiento.guardar(clave, archivo.buffer, tipoMime);
    try {
      const actualizada = await this.prisma.$transaction(async (tx) => {
        // Guarda: si tesorería o el vencimiento ya resolvieron la orden, el soporte no la revierte.
        const { count } = await tx.ordenPago.updateMany({
          where: { id: orden.id, estado: EstadoOrdenPago.PENDIENTE },
          data: { soporteUrl: clave, estado: EstadoOrdenPago.EN_VERIFICACION },
        });
        if (count === 0) {
          throw new ErrorDominio(
            'ORDEN_NO_PERMITIDA',
            'La orden de pago ya no está pendiente. Actualiza e intenta de nuevo.',
            409,
          );
        }
        const fila = await tx.ordenPago.findUniqueOrThrow({ where: { id: orden.id } });
        await tx.bitacora.create({
          data: {
            usuarioId: usuario.id,
            accion: 'SOPORTE_PAGO_CARGADO',
            entidad: 'OrdenPago',
            entidadId: orden.id,
            ip: contexto.ip,
            userAgent: contexto.userAgent,
            correlacionId: contexto.correlacionId,
            datosDespues: { referencia: orden.referencia },
          },
        });
        return fila;
      });
      return this.aDto(actualizada, leerCuenta(await this.parametros.obtenerJson('cuenta_recaudo')));
    } catch (error) {
      await this.almacenamiento.eliminar(clave);
      throw error;
    }
  }

  /** UC-03 paso 3: tesorería aprueba o rechaza. Aprobar confirma la solicitud y sus franjas (RN-11). */
  async verificar(
    ordenId: string,
    datos: VerificarPagoDto,
    usuario: UsuarioAutenticado,
    contexto: ContextoPago,
  ): Promise<VerificacionDto> {
    const orden = await this.prisma.ordenPago.findUnique({
      where: { id: ordenId },
      include: {
        cotizacion: {
          include: { solicitud: { include: { reservas: { select: { id: true } } } } },
        },
      },
    });
    if (!orden) throw noEncontrado('La orden de pago');
    if (orden.estado !== EstadoOrdenPago.EN_VERIFICACION) {
      throw new ErrorDominio(
        'ORDEN_NO_VERIFICABLE',
        'Solo se verifica una orden con soporte cargado y en verificación.',
        409,
      );
    }
    const observacion = datos.observacion?.trim() ?? '';
    if (datos.resultado === 'RECHAZADA' && observacion.length === 0) {
      throw new ErrorDominio('MOTIVO_REQUERIDO', 'Indica por qué se rechaza el pago.', 422);
    }

    const solicitud = orden.cotizacion.solicitud;
    const ahora = new Date();
    const resultado = await this.prisma.$transaction(async (tx) => {
      // Guarda de concurrencia: solo una verificación puede resolver la orden.
      const { count } = await tx.ordenPago.updateMany({
        where: { id: ordenId, estado: EstadoOrdenPago.EN_VERIFICACION },
        data: { actualizadaEn: new Date() },
      });
      if (count === 0) {
        throw new ErrorDominio(
          'ORDEN_NO_VERIFICABLE',
          'La orden ya fue verificada por otra persona.',
          409,
        );
      }
      let estadoSolicitud: EstadoSolicitud = solicitud.estado;
      if (datos.resultado === 'APROBADA') {
        const destino = transicionOConflicto(solicitud.estado, 'CONFIRMAR_PAGO');
        const confirmada = await tx.solicitud.updateMany({
          where: { id: solicitud.id, estado: solicitud.estado },
          data: { estado: destino, venceEn: null },
        });
        if (confirmada.count === 0) {
          throw new ErrorDominio(
            'TRANSICION_INVALIDA',
            'La solicitud cambió de estado mientras se verificaba el pago. Actualiza e intenta de nuevo.',
            409,
          );
        }
        await tx.ordenPago.update({
          where: { id: ordenId },
          data: {
            estado: EstadoOrdenPago.APROBADA,
            pagadoEn: ahora,
            verificadaPorId: usuario.id,
            observacionTesoreria: observacion || null,
          },
        });
        await tx.franjaOcupada.updateMany({
          where: { reservaItemId: { in: solicitud.reservas.map((r) => r.id) }, estado: 'RETENIDA' },
          data: { estado: 'CONFIRMADA', retenidaHasta: null },
        });
        await tx.historialEstadoSolicitud.create({
          data: {
            solicitudId: solicitud.id,
            estadoAnterior: solicitud.estado,
            estadoNuevo: destino,
            usuarioId: usuario.id,
            observacion: orden.referencia,
          },
        });
        estadoSolicitud = destino;
      } else {
        await tx.ordenPago.update({
          where: { id: ordenId },
          data: {
            estado: EstadoOrdenPago.RECHAZADA,
            verificadaPorId: usuario.id,
            observacionTesoreria: observacion,
          },
        });
      }
      await tx.bitacora.create({
        data: {
          usuarioId: usuario.id,
          accion: datos.resultado === 'APROBADA' ? 'PAGO_APROBADO' : 'PAGO_RECHAZADO',
          entidad: 'OrdenPago',
          entidadId: ordenId,
          ip: contexto.ip,
          userAgent: contexto.userAgent,
          correlacionId: contexto.correlacionId,
          datosDespues: { referencia: orden.referencia, valor: orden.valor, observacion: observacion || null },
        },
      });
      return {
        estadoOrden: datos.resultado === 'APROBADA' ? EstadoOrdenPago.APROBADA : EstadoOrdenPago.RECHAZADA,
        estadoSolicitud,
      };
    });
    const etiqueta = solicitud.consecutivo ?? orden.referencia;
    const aprobada = datos.resultado === 'APROBADA';
    await this.notificaciones.notificarSolicitante(solicitud.id, {
      titulo: aprobada
        ? `Pago confirmado de la solicitud ${etiqueta}`
        : `Pago rechazado de la solicitud ${etiqueta}`,
      cuerpo: aprobada
        ? `Verificamos la consignación de la orden ${orden.referencia}. Tu horario quedó confirmado.`
        : `No pudimos verificar la orden ${orden.referencia}. Motivo: ${observacion}. Genera una nueva orden.`,
    });
    return resultado;
  }

  /**
   * RN-02d. Llega un pago de una solicitud ya vencida: si sus franjas siguen libres se vuelven a ocupar y se
   * confirma; si no, el pago queda marcado para reembolso total y se avisa a tesorería y al solicitante.
   */
  async registrarPagoTardio(
    ordenId: string,
    datos: RegistrarPagoTardioDto,
    usuario: UsuarioAutenticado,
    contexto: ContextoPago,
  ): Promise<PagoTardioDto> {
    const orden = await this.prisma.ordenPago.findUnique({
      where: { id: ordenId },
      include: {
        cotizacion: { include: { solicitud: { include: { reservas: { select: { id: true } } } } } },
      },
    });
    if (!orden) throw noEncontrado('La orden de pago');
    const solicitud = orden.cotizacion.solicitud;
    if (orden.estado !== EstadoOrdenPago.VENCIDA || solicitud.estado !== EstadoSolicitud.VENCIDA) {
      throw new ErrorDominio(
        'PAGO_TARDIO_NO_APLICA',
        'Solo se registra un pago tardío sobre una orden vencida de una solicitud vencida.',
        409,
      );
    }

    const reservaIds = solicitud.reservas.map((r) => r.id);
    const franjas = await this.prisma.franjaOcupada.findMany({
      where: { reservaItemId: { in: reservaIds } },
      select: { id: true, espacioId: true, inicio: true, fin: true },
    });
    let libres = franjas.length > 0;
    for (const franja of franjas) {
      const choque = await this.prisma.franjaOcupada.findFirst({
        where: {
          id: { not: franja.id },
          espacioId: franja.espacioId,
          estado: { not: 'LIBERADA' },
          inicio: { lt: franja.fin },
          fin: { gt: franja.inicio },
        },
        select: { id: true },
      });
      if (choque) {
        libres = false;
        break;
      }
    }

    const observacion = datos.observacion?.trim() || null;
    const ahora = new Date();
    const resultado = await this.prisma.$transaction(async (tx): Promise<PagoTardioDto> => {
      const { count } = await tx.ordenPago.updateMany({
        where: { id: ordenId, estado: EstadoOrdenPago.VENCIDA },
        data: {
          estado: EstadoOrdenPago.APROBADA,
          pagadoEn: ahora,
          verificadaPorId: usuario.id,
          observacionTesoreria: observacion,
        },
      });
      if (count === 0) {
        throw new ErrorDominio('PAGO_TARDIO_NO_APLICA', 'La orden ya fue resuelta por otra persona.', 409);
      }

      if (libres) {
        const destino = transicionOConflicto(solicitud.estado, 'CONFIRMAR_PAGO_TARDIO');
        const confirmada = await tx.solicitud.updateMany({
          where: { id: solicitud.id, estado: EstadoSolicitud.VENCIDA },
          data: { estado: destino, venceEn: null },
        });
        if (confirmada.count === 0) {
          throw new ErrorDominio(
            'PAGO_TARDIO_NO_APLICA',
            'La solicitud cambió de estado mientras se registraba el pago. Actualiza e intenta de nuevo.',
            409,
          );
        }
        await tx.franjaOcupada.updateMany({
          where: { id: { in: franjas.map((f) => f.id) } },
          data: { estado: 'CONFIRMADA', retenidaHasta: null },
        });
        await tx.historialEstadoSolicitud.create({
          data: {
            solicitudId: solicitud.id,
            estadoAnterior: solicitud.estado,
            estadoNuevo: destino,
            usuarioId: usuario.id,
            observacion: `Pago tardío ${orden.referencia}`,
          },
        });
        await tx.bitacora.create({
          data: {
            usuarioId: usuario.id,
            accion: 'PAGO_TARDIO_CONFIRMADO',
            entidad: 'OrdenPago',
            entidadId: ordenId,
            ip: contexto.ip,
            userAgent: contexto.userAgent,
            correlacionId: contexto.correlacionId,
            datosDespues: { referencia: orden.referencia, valor: orden.valor, solicitudId: solicitud.id },
          },
        });
        return { resultado: 'CONFIRMADA', estadoSolicitud: destino, valorReembolso: null };
      }

      await tx.reembolso.create({
        data: { ordenPagoId: ordenId, valor: orden.valor, motivo: 'PAGO_TARDIO_SIN_FRANJA_LIBRE' },
      });
      await tx.bitacora.create({
        data: {
          usuarioId: usuario.id,
          accion: 'PAGO_TARDIO_REEMBOLSO',
          entidad: 'OrdenPago',
          entidadId: ordenId,
          ip: contexto.ip,
          userAgent: contexto.userAgent,
          correlacionId: contexto.correlacionId,
          datosDespues: { referencia: orden.referencia, valor: orden.valor, solicitudId: solicitud.id },
        },
      });
      return { resultado: 'REEMBOLSO', estadoSolicitud: solicitud.estado, valorReembolso: orden.valor };
    });

    const etiqueta = solicitud.consecutivo ?? orden.referencia;
    if (resultado.resultado === 'CONFIRMADA') {
      await this.notificaciones.notificarSolicitante(solicitud.id, {
        titulo: `Pago confirmado de la solicitud ${etiqueta}`,
        cuerpo: `Recibimos tu pago de la orden ${orden.referencia} fuera de plazo y tu horario quedó confirmado.`,
      });
    } else {
      await this.notificaciones.notificarSolicitante(solicitud.id, {
        titulo: `Reembolso del pago de la solicitud ${etiqueta}`,
        cuerpo:
          `Recibimos tu pago de la orden ${orden.referencia} fuera de plazo y el horario ya no estaba libre. ` +
          'Te reembolsaremos el valor completo.',
      });
      const tesoreria = await this.prisma.usuarioRol.findMany({
        where: { rol: 'TESORERIA', usuario: { activo: true } },
        select: { usuarioId: true },
      });
      await Promise.all(
        [...new Set(tesoreria.map((t) => t.usuarioId))].map((id) =>
          this.notificaciones.notificarUsuario(id, {
            titulo: `Reembolso pendiente: orden ${orden.referencia}`,
            cuerpo: `Pago tardío sin franja libre. Reembolsa ${orden.valor} pesos al solicitante.`,
          }),
        ),
      );
    }
    return resultado;
  }

  async listar(filtros: FiltrosOrdenesDto): Promise<PaginaOrdenesDto> {
    const where: Prisma.OrdenPagoWhereInput = filtros.estado ? { estado: filtros.estado } : {};
    const [total, filas] = await Promise.all([
      this.prisma.ordenPago.count({ where }),
      this.prisma.ordenPago.findMany({
        where,
        orderBy: { creadaEn: 'desc' },
        skip: (filtros.pagina - 1) * filtros.porPagina,
        take: filtros.porPagina,
        include: { cotizacion: { select: { solicitudId: true, solicitud: { select: { consecutivo: true } } } } },
      }),
    ]);
    const datos: OrdenPagoResumenDto[] = filas.map((f) => ({
      id: f.id,
      referencia: f.referencia,
      solicitudId: f.cotizacion.solicitudId,
      consecutivoSolicitud: f.cotizacion.solicitud.consecutivo,
      valor: f.valor,
      estado: f.estado,
      tieneSoporte: f.soporteUrl !== null,
      venceEn: f.venceEn.toISOString(),
      pagadoEn: f.pagadoEn?.toISOString() ?? null,
    }));
    return { datos, total, pagina: filtros.pagina, porPagina: filtros.porPagina };
  }

  /** Descarga del comprobante: su dueño, tesorería y auditoría. */
  async descargarSoporte(ordenId: string, usuario: UsuarioAutenticado): Promise<SoporteDescargable> {
    const revisor = usuario.roles.includes('TESORERIA') || usuario.roles.includes('AUDITOR');
    const orden = revisor
      ? await this.prisma.ordenPago.findUnique({ where: { id: ordenId } })
      : await this.ordenPropia(ordenId, usuario);
    if (!orden?.soporteUrl) throw noEncontrado('El soporte de pago');
    const contenido = await this.almacenamiento.leer(orden.soporteUrl);
    const tipoMime = contenido ? detectarTipoMime(contenido) : null;
    if (!contenido || !tipoMime) throw noEncontrado('El soporte de pago');
    return { contenido, tipoMime, nombre: `${orden.referencia}.${EXTENSION_POR_TIPO[tipoMime]}` };
  }

  private async ordenPropia(ordenId: string, usuario: UsuarioAutenticado): Promise<FilaOrden> {
    const orden = await this.prisma.ordenPago.findFirst({
      where: { id: ordenId, cotizacion: { solicitud: { solicitante: { usuarioId: usuario.id } } } },
    });
    if (!orden) throw noEncontrado('La orden de pago');
    return orden;
  }

  private aDto(orden: FilaOrden, cuenta: CuentaRecaudoDto): OrdenPagoDto {
    return {
      id: orden.id,
      referencia: orden.referencia,
      valor: orden.valor,
      medio: orden.medio,
      estado: orden.estado,
      venceEn: orden.venceEn.toISOString(),
      tieneSoporte: orden.soporteUrl !== null,
      observacionTesoreria: orden.observacionTesoreria,
      pagadoEn: orden.pagadoEn?.toISOString() ?? null,
      cuentaRecaudo: cuenta,
    };
  }
}
