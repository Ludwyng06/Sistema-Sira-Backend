import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import {
  EstadoSolicitud,
  ResultadoDecision,
  Rol,
  TipoDecision,
  TipoSolicitante,
  type UnidadCobroTarifa,
} from '../../../generated/prisma/enums.js';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ConsecutivoService } from '../../../shared/consecutivos/consecutivo.service.js';
import { ErrorDominio, noEncontrado } from '../../../shared/errores/error-dominio.js';
import { ParametroService } from '../../../shared/parametros/parametro.service.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { NotificacionesService } from '../../notificaciones/services/notificaciones.service.js';
import { TarifarioService, type TarifaCalculada } from '../../tarifario/services/tarifario.service.js';
import { type EventoSolicitud, transicionOConflicto } from '../dominio/maquina-estados.js';
import type { DecidirSolicitudDto, DecisionRegistradaDto } from '../dto/decision.dto.js';

export interface ContextoDecision {
  ip: string | null;
  userAgent: string | null;
  correlacionId: string | null;
}

const MS_HORA = 3_600_000;
const MS_DIA = 86_400_000;

interface Cotizado {
  desglose: Prisma.InputJsonValue;
  subtotal: number;
  iva: number;
  total: number;
  valorReferencia: number;
  deposito: number;
  recalculosReserva: {
    id: string;
    unidad: UnidadCobroTarifa | null;
    cantidad: number;
    valorUnitario: number;
    recargos: number;
    subtotal: number;
  }[];
}

function dosDecimales(valor: number): number {
  return Math.round(valor * 100) / 100;
}

@Injectable()
export class DecisionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tarifario: TarifarioService,
    private readonly consecutivos: ConsecutivoService,
    private readonly parametros: ParametroService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  async decidir(
    id: string,
    datos: DecidirSolicitudDto,
    usuario: UsuarioAutenticado,
    contexto: ContextoDecision,
  ): Promise<DecisionRegistradaDto> {
    const solicitud = await this.prisma.solicitud.findFirst({
      where: { id, estado: { not: EstadoSolicitud.BORRADOR } },
      include: {
        reservas: {
          orderBy: { inicio: 'asc' },
          include: {
            espacio: {
              select: {
                id: true,
                responsableId: true,
                dependenciaId: true,
                requiereAval: true,
                depositoValorFijo: true,
                depositoPorcentaje: true,
                tipo: { select: { anticipacionMinimaDias: true } },
              },
            },
          },
        },
        servicios: true,
        decisiones: { select: { tipo: true, resultado: true, decididaEn: true } },
      },
    });
    if (!solicitud || !this.puedeDecidir(datos.tipo, solicitud.reservas, usuario)) {
      throw noEncontrado('La solicitud');
    }
    if (solicitud.estado !== EstadoSolicitud.EN_REVISION) {
      throw new ErrorDominio(
        'SOLICITUD_NO_DECIDIBLE',
        'Esta solicitud no está en revisión, por lo que no admite decisiones.',
        409,
      );
    }

    const motivo = datos.motivo?.trim() ?? '';
    if (datos.resultado !== ResultadoDecision.APROBADA && motivo.length === 0) {
      throw new ErrorDominio('MOTIVO_REQUERIDO', 'Indica el motivo de la decisión.', 422);
    }
    if (datos.tipo === TipoDecision.AVAL && datos.resultado === ResultadoDecision.RECLASIFICADA) {
      throw new ErrorDominio('RESULTADO_INVALIDO', 'El aval no puede reclasificar la solicitud.', 422);
    }
    if (datos.resultado === ResultadoDecision.RECLASIFICADA && !solicitud.esExenta) {
      throw new ErrorDominio(
        'RESULTADO_INVALIDO',
        'Solo se reclasifica una solicitud exenta; esta ya se cobra.',
        422,
      );
    }

    const vigentes = solicitud.decisiones.filter(
      (d) => solicitud.enviadaEn === null || d.decididaEn >= solicitud.enviadaEn,
    );
    const requiereAval = solicitud.reservas.some((r) => r.espacio.requiereAval);
    const avalAprobado = vigentes.some(
      (d) => d.tipo === TipoDecision.AVAL && d.resultado === ResultadoDecision.APROBADA,
    );
    if (datos.tipo === TipoDecision.AVAL) {
      if (!requiereAval) {
        throw new ErrorDominio('AVAL_NO_REQUERIDO', 'Los espacios de esta solicitud no requieren aval.', 422);
      }
      if (avalAprobado) {
        throw new ErrorDominio('DECISION_YA_REGISTRADA', 'El aval de esta solicitud ya fue otorgado.', 409);
      }
    } else if (requiereAval && !avalAprobado) {
      throw new ErrorDominio(
        'AVAL_PENDIENTE',
        'El responsable del espacio debe dar su aval antes de la aprobación.',
        422,
      );
    }

    const ahora = new Date();
    const evento = this.eventoDe(datos);
    const emiteCotizacion = evento === 'APROBAR';
    const reclasifica = datos.resultado === ResultadoDecision.RECLASIFICADA;
    const esExentaFinal = reclasifica ? false : solicitud.esExenta;
    const tipoTarifa = reclasifica ? TipoSolicitante.PERSONA_NATURAL : solicitud.tipoTarifa;

    let cotizado: Cotizado | null = null;
    let validaHasta: Date | null = null;
    if (emiteCotizacion) {
      cotizado = await this.cotizar(solicitud, tipoTarifa, esExentaFinal);
      const horasPago = await this.parametros.obtenerNumero('horas_plazo_pago');
      const anticipacion = Math.max(...solicitud.reservas.map((r) => r.espacio.tipo.anticipacionMinimaDias));
      validaHasta = new Date(
        Math.min(
          ahora.getTime() + horasPago * MS_HORA,
          solicitud.reservas[0]!.inicio.getTime() - anticipacion * MS_DIA,
        ),
      );
    }

    const registrada = await this.prisma.$transaction(async (tx) => {
      // Guarda de concurrencia: si otra decisión cambió el estado entre la lectura y aquí, esta no procede.
      const { count } = await tx.solicitud.updateMany({
        where: { id, estado: EstadoSolicitud.EN_REVISION },
        data: { actualizadoEn: new Date() },
      });
      if (count === 0) {
        throw new ErrorDominio(
          'SOLICITUD_NO_DECIDIBLE',
          'Esta solicitud ya no está en revisión, por lo que no admite decisiones.',
          409,
        );
      }
      if (datos.tipo === TipoDecision.AVAL && datos.resultado === ResultadoDecision.APROBADA) {
        const previas = await tx.decision.count({
          where: {
            solicitudId: id,
            tipo: TipoDecision.AVAL,
            resultado: ResultadoDecision.APROBADA,
            ...(solicitud.enviadaEn ? { decididaEn: { gte: solicitud.enviadaEn } } : {}),
          },
        });
        if (previas > 0) {
          throw new ErrorDominio('DECISION_YA_REGISTRADA', 'El aval de esta solicitud ya fue otorgado.', 409);
        }
      }
      const decision = await tx.decision.create({
        data: {
          solicitudId: id,
          tipo: datos.tipo,
          resultado: datos.resultado,
          motivo: motivo || null,
          decididaPorId: usuario.id,
        },
        select: { id: true },
      });

      let estado: EstadoSolicitud = solicitud.estado;
      let consecutivoCotizacion: string | null = null;
      const pasos: { desde: EstadoSolicitud; hasta: EstadoSolicitud }[] = [];
      const avanzar = (evt: EventoSolicitud) => {
        const hasta = transicionOConflicto(estado, evt);
        pasos.push({ desde: estado, hasta });
        estado = hasta;
      };

      if (evento === 'RECHAZAR') {
        avanzar('RECHAZAR');
        await tx.franjaOcupada.updateMany({
          where: { reservaItemId: { in: solicitud.reservas.map((r) => r.id) }, estado: { not: 'LIBERADA' } },
          data: { estado: 'LIBERADA', retenidaHasta: null },
        });
      } else if (evento === 'DEVOLVER') {
        avanzar('DEVOLVER');
        const reservaIds = solicitud.reservas.map((r) => r.id);
        await tx.franjaOcupada.updateMany({
          where: { reservaItemId: { in: reservaIds }, estado: { not: 'LIBERADA' } },
          data: { estado: 'LIBERADA', retenidaHasta: null },
        });
        await tx.franjaOcupada.updateMany({
          where: { reservaItemId: { in: reservaIds } },
          data: { reservaItemId: null },
        });
      } else if (emiteCotizacion && cotizado && validaHasta) {
        avanzar('APROBAR');
        consecutivoCotizacion = await this.consecutivos.siguiente(tx, 'COTIZACION');
        await tx.cotizacion.create({
          data: {
            consecutivo: consecutivoCotizacion,
            solicitudId: id,
            subtotal: cotizado.subtotal,
            iva: cotizado.iva,
            total: esExentaFinal ? 0 : cotizado.total,
            depositoGarantia: esExentaFinal ? 0 : cotizado.deposito,
            valorReferencia: esExentaFinal ? cotizado.valorReferencia : 0,
            esExenta: esExentaFinal,
            validaHasta,
            desglose: cotizado.desglose,
          },
        });
        for (const recalculo of cotizado.recalculosReserva) {
          await tx.reservaItem.update({
            where: { id: recalculo.id },
            data: {
              unidad: recalculo.unidad,
              cantidad: recalculo.cantidad,
              valorUnitario: recalculo.valorUnitario,
              recargos: recalculo.recargos,
              subtotal: recalculo.subtotal,
            },
          });
        }
        if (esExentaFinal) {
          avanzar('APROBAR_EXENTA');
          await tx.franjaOcupada.updateMany({
            where: { reservaItemId: { in: solicitud.reservas.map((r) => r.id) }, estado: 'RETENIDA' },
            data: { estado: 'CONFIRMADA', retenidaHasta: null },
          });
        } else {
          await tx.franjaOcupada.updateMany({
            where: { reservaItemId: { in: solicitud.reservas.map((r) => r.id) }, estado: 'RETENIDA' },
            data: { retenidaHasta: validaHasta },
          });
        }
      }

      if (pasos.length > 0) {
        await tx.solicitud.update({
          where: { id },
          data: {
            estado,
            esExenta: esExentaFinal,
            tipoTarifa,
            venceEn: estado === EstadoSolicitud.COTIZADA ? validaHasta : null,
          },
        });
        await tx.historialEstadoSolicitud.createMany({
          data: pasos.map((paso) => ({
            solicitudId: id,
            estadoAnterior: paso.desde,
            estadoNuevo: paso.hasta,
            usuarioId: usuario.id,
            observacion: motivo || null,
          })),
        });
      }

      await tx.bitacora.create({
        data: {
          usuarioId: usuario.id,
          accion: 'SOLICITUD_DECIDIDA',
          entidad: 'Solicitud',
          entidadId: id,
          ip: contexto.ip,
          userAgent: contexto.userAgent,
          correlacionId: contexto.correlacionId,
          datosDespues: {
            tipo: datos.tipo,
            resultado: datos.resultado,
            estado,
            cotizacion: consecutivoCotizacion,
            motivo: motivo || null,
          },
        },
      });

      return {
        decisionId: decision.id,
        tipo: datos.tipo,
        resultado: datos.resultado,
        estadoSolicitud: estado,
        cotizacion: consecutivoCotizacion,
      };
    });
    await this.avisar(solicitud, datos, registrada, motivo);
    return registrada;
  }

  private async avisar(
    solicitud: { id: string; consecutivo: string | null; reservas: { espacio: { dependenciaId: string | null } }[] },
    datos: DecidirSolicitudDto,
    registrada: DecisionRegistradaDto,
    motivo: string,
  ): Promise<void> {
    const etiqueta = solicitud.consecutivo ?? 'tu solicitud';
    const enlace = `/solicitudes/${solicitud.id}`;
    const aviso = (titulo: string, cuerpo: string) =>
      this.notificaciones.notificarSolicitante(solicitud.id, { titulo, cuerpo, enlace });

    if (datos.tipo === TipoDecision.AVAL && datos.resultado === ResultadoDecision.APROBADA) {
      const dependencias = solicitud.reservas
        .map((r) => r.espacio.dependenciaId)
        .filter((d): d is string => d !== null);
      await this.notificaciones.notificarAprobadores(dependencias, {
        titulo: `Solicitud ${etiqueta} lista para aprobación`,
        cuerpo: 'El responsable del espacio dio su aval. Revisa el detalle y registra tu decisión.',
        enlace,
      });
      return;
    }
    switch (registrada.estadoSolicitud) {
      case EstadoSolicitud.CONFIRMADA:
        await aviso(`Tu solicitud ${etiqueta} fue confirmada`, 'Fue aprobada y tu horario quedó reservado.');
        return;
      case EstadoSolicitud.COTIZADA:
        await aviso(
          `Tu solicitud ${etiqueta} fue aprobada`,
          'Ya puedes generar la orden de pago desde el detalle de la solicitud.' +
            (datos.resultado === ResultadoDecision.RECLASIFICADA
              ? ` Se cobra como persona natural. Motivo: ${motivo}`
              : ''),
        );
        return;
      case EstadoSolicitud.RECHAZADA:
        await aviso(`Tu solicitud ${etiqueta} fue rechazada`, `Motivo: ${motivo}`);
        return;
      case EstadoSolicitud.BORRADOR:
        await aviso(
          `Tu solicitud ${etiqueta} fue devuelta`,
          `Motivo: ${motivo}. Corrígela y envíala de nuevo.`,
        );
        return;
      default:
        return;
    }
  }

  private eventoDe(datos: DecidirSolicitudDto): EventoSolicitud | null {
    switch (datos.resultado) {
      case ResultadoDecision.RECHAZADA:
        return 'RECHAZAR';
      case ResultadoDecision.DEVUELTA:
        return 'DEVOLVER';
      case ResultadoDecision.RECLASIFICADA:
        return 'APROBAR';
      case ResultadoDecision.APROBADA:
        return datos.tipo === TipoDecision.APROBACION ? 'APROBAR' : null;
    }
  }

  private puedeDecidir(
    tipo: TipoDecision,
    reservas: { espacio: { responsableId: string | null; dependenciaId: string | null } }[],
    usuario: UsuarioAutenticado,
  ): boolean {
    if (tipo === TipoDecision.AVAL) {
      return (
        usuario.roles.includes(Rol.RESPONSABLE_ESPACIO) &&
        reservas.some((r) => r.espacio.responsableId === usuario.id)
      );
    }
    return (
      usuario.roles.includes(Rol.APROBADOR) &&
      reservas.some((r) => r.espacio.dependenciaId !== null && usuario.dependencias.includes(r.espacio.dependenciaId))
    );
  }

  /** RN-05: congela el desglose con la tarifa vigente a la emisión. */
  private async cotizar(
    solicitud: {
      reservas: {
        id: string;
        espacioId: string;
        inicio: Date;
        fin: Date;
        espacio: { depositoValorFijo: number | null; depositoPorcentaje: { toString(): string } | null };
      }[];
      servicios: { id: string; servicioId: string; cantidad: number; valorUnitario: number; subtotal: number }[];
    },
    tipoTarifa: TipoSolicitante,
    esExenta: boolean,
  ): Promise<Cotizado> {
    const recalculosReserva: Cotizado['recalculosReserva'] = [];
    const reservasDesglose: Record<string, unknown>[] = [];
    let subtotalEspacios = 0;
    let iva = 0;
    let referencia = 0;
    let depositoFijo = 0;
    let depositoPorcentaje = 0;

    for (const r of solicitud.reservas) {
      const calculo: TarifaCalculada = await this.tarifario.calcular({
        espacioId: r.espacioId,
        tipoSolicitante: tipoTarifa,
        inicio: r.inicio,
        fin: r.fin,
      });
      const cantidad = calculo.lineas.reduce((suma, l) => suma + l.cantidad, 0);
      const unidades = new Set(calculo.lineas.map((l) => l.unidad));
      const unica = unidades.size === 1 ? [...unidades][0]! : null;
      recalculosReserva.push({
        id: r.id,
        unidad: unica && unica !== 'JORNADAS' ? unica : null,
        cantidad: dosDecimales(cantidad),
        valorUnitario: cantidad > 0 ? Math.round(calculo.base / cantidad) : 0,
        recargos: calculo.recargos,
        subtotal: calculo.subtotal,
      });
      subtotalEspacios += calculo.subtotal;
      iva += calculo.iva;
      reservasDesglose.push({
        reservaId: r.id,
        espacioId: r.espacioId,
        inicio: r.inicio.toISOString(),
        fin: r.fin.toISOString(),
        lineas: calculo.lineas,
        base: calculo.base,
        recargos: calculo.recargos,
        subtotal: calculo.subtotal,
        iva: calculo.iva,
      });
      depositoFijo += r.espacio.depositoValorFijo ?? 0;
      depositoPorcentaje += Number(r.espacio.depositoPorcentaje?.toString() ?? 0);

      if (esExenta) {
        try {
          const comparable = await this.tarifario.calcular({
            espacioId: r.espacioId,
            tipoSolicitante: TipoSolicitante.PERSONA_NATURAL,
            inicio: r.inicio,
            fin: r.fin,
          });
          referencia += comparable.total;
        } catch (error) {
          if (!(error instanceof ErrorDominio) || error.codigo !== 'TARIFA_NO_DEFINIDA') throw error;
        }
      }
    }

    const subtotalServicios = solicitud.servicios.reduce((suma, s) => suma + s.subtotal, 0);
    const subtotal = subtotalEspacios + subtotalServicios;
    const deposito = depositoFijo + Math.round((subtotal * depositoPorcentaje) / 100);
    return {
      desglose: {
        tipoTarifa,
        reservas: reservasDesglose,
        servicios: solicitud.servicios.map((s) => ({
          servicioItemId: s.id,
          servicioId: s.servicioId,
          cantidad: s.cantidad,
          valorUnitario: s.valorUnitario,
          subtotal: s.subtotal,
        })),
      } as Prisma.InputJsonValue,
      subtotal,
      iva,
      total: subtotal + iva,
      valorReferencia: referencia + subtotalServicios,
      deposito,
      recalculosReserva,
    };
  }
}
