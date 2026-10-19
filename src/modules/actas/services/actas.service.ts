import { Injectable } from '@nestjs/common';
import { EstadoSolicitud, Rol, TipoActa } from '../../../generated/prisma/enums.js';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ConsecutivoService } from '../../../shared/consecutivos/consecutivo.service.js';
import { ErrorDominio, noEncontrado } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { NotificacionesService } from '../../notificaciones/services/notificaciones.service.js';
import { transicionOConflicto } from '../../reservas/dominio/maquina-estados.js';
import type { ActaDto, CrearActaDto, ItemChecklistDto, NovedadDto } from '../dto/acta.dto.js';

export interface ContextoActa {
  ip: string | null;
  userAgent: string | null;
  correlacionId: string | null;
}

const ESTADO_REQUERIDO: Record<TipoActa, EstadoSolicitud> = {
  ENTREGA: EstadoSolicitud.CONFIRMADA,
  DEVOLUCION: EstadoSolicitud.EN_USO,
};

const EVENTO: Record<TipoActa, 'ENTREGAR' | 'DEVOLVER_ESPACIO'> = {
  ENTREGA: 'ENTREGAR',
  DEVOLUCION: 'DEVOLVER_ESPACIO',
};

function checklistInvalido(mensaje: string, detalles?: unknown): ErrorDominio {
  return new ErrorDominio('CHECKLIST_INVALIDO', mensaje, 422, detalles);
}

@Injectable()
export class ActasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consecutivos: ConsecutivoService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  /** UC-05. Solo el responsable de un espacio de la solicitud; una acta de cada tipo por solicitud. */
  async crear(datos: CrearActaDto, usuario: UsuarioAutenticado, contexto: ContextoActa): Promise<ActaDto> {
    const solicitud = await this.prisma.solicitud.findFirst({
      where: {
        id: datos.solicitudId,
        reservas: { some: { espacio: { responsableId: usuario.id } } },
      },
      include: {
        reservas: { select: { id: true, espacioId: true } },
        actas: { select: { tipo: true } },
      },
    });
    if (!solicitud || !usuario.roles.includes(Rol.RESPONSABLE_ESPACIO)) throw noEncontrado('La solicitud');

    if (solicitud.actas.some((a) => a.tipo === datos.tipo)) {
      throw new ErrorDominio(
        'ACTA_YA_REGISTRADA',
        `Esta solicitud ya tiene el acta de ${datos.tipo === 'ENTREGA' ? 'entrega' : 'devolución'}.`,
        409,
      );
    }
    if (solicitud.estado !== ESTADO_REQUERIDO[datos.tipo]) {
      throw new ErrorDominio(
        'ACTA_NO_PERMITIDA',
        datos.tipo === 'ENTREGA'
          ? 'El acta de entrega solo se registra para una solicitud confirmada.'
          : 'El acta de devolución solo se registra para una solicitud en uso.',
        409,
      );
    }

    const elementos = await this.prisma.elemento.findMany({
      where: {
        espacioId: { in: [...new Set(solicitud.reservas.map((r) => r.espacioId))] },
        estado: 'EN_SERVICIO',
        cantidad: { gt: 0 },
      },
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true, cantidad: true },
    });
    const porId = new Map(elementos.map((e) => [e.id, e]));

    const enviados = new Set<string>();
    for (const item of datos.checklist) {
      if (!porId.has(item.elementoId)) {
        throw checklistInvalido('El checklist incluye un elemento que no pertenece a esta solicitud.', {
          elementoId: item.elementoId,
        });
      }
      if (enviados.has(item.elementoId)) {
        throw checklistInvalido('El checklist repite un elemento.', { elementoId: item.elementoId });
      }
      enviados.add(item.elementoId);
    }
    const faltantes = elementos.filter((e) => !enviados.has(e.id));
    if (faltantes.length > 0) {
      throw checklistInvalido('Verifica todos los elementos del espacio antes de registrar el acta.', {
        faltantes: faltantes.map((e) => ({ elementoId: e.id, nombre: e.nombre })),
      });
    }

    const checklist: ItemChecklistDto[] = datos.checklist.map((item) => {
      const elemento = porId.get(item.elementoId)!;
      return {
        elementoId: elemento.id,
        nombre: elemento.nombre,
        cantidadEsperada: elemento.cantidad,
        cantidadEncontrada: item.cantidadEncontrada,
        estadoFisico: item.estadoFisico,
        ok: item.cantidadEncontrada >= elemento.cantidad && item.estadoFisico !== 'MALO',
      };
    });

    const novedades = datos.novedades ?? [];
    for (const novedad of novedades) {
      if (novedad.elementoId && !porId.has(novedad.elementoId)) {
        throw checklistInvalido('Una novedad hace referencia a un elemento que no pertenece a esta solicitud.', {
          elementoId: novedad.elementoId,
        });
      }
    }
    if (datos.tipo === TipoActa.DEVOLUCION) {
      const sinNovedad = checklist.filter(
        (c) => !c.ok && !novedades.some((n) => n.elementoId === c.elementoId),
      );
      if (sinNovedad.length > 0) {
        throw new ErrorDominio(
          'NOVEDAD_REQUERIDA',
          'Registra una novedad por cada elemento incompleto o en mal estado.',
          422,
          { elementos: sinNovedad.map((c) => ({ elementoId: c.elementoId, nombre: c.nombre })) },
        );
      }
    }

    const destino = transicionOConflicto(solicitud.estado, EVENTO[datos.tipo]);
    const observaciones = datos.observaciones?.trim() || null;

    const registrada = await this.prisma.$transaction(async (tx) => {
      // Guarda de concurrencia: el cambio de estado es atómico; la segunda acta no pasa.
      const guarda = await tx.solicitud.updateMany({
        where: { id: solicitud.id, estado: solicitud.estado },
        data: { estado: destino },
      });
      if (guarda.count === 0) {
        const existente = await tx.acta.count({ where: { solicitudId: solicitud.id, tipo: datos.tipo } });
        if (existente > 0) {
          throw new ErrorDominio(
            'ACTA_YA_REGISTRADA',
            `Esta solicitud ya tiene el acta de ${datos.tipo === 'ENTREGA' ? 'entrega' : 'devolución'}.`,
            409,
          );
        }
        throw new ErrorDominio(
          'ACTA_NO_PERMITIDA',
          'La solicitud cambió de estado mientras se registraba el acta. Actualiza e intenta de nuevo.',
          409,
        );
      }
      const consecutivo = await this.consecutivos.siguiente(tx, 'ACTA');
      const acta = await tx.acta.create({
        data: {
          consecutivo,
          solicitudId: solicitud.id,
          tipo: datos.tipo,
          checklist: checklist as unknown as never,
          observaciones,
          generadaPorId: usuario.id,
        },
      });
      const creadas: NovedadDto[] = [];
      for (const n of novedades) {
        const fila = await tx.novedad.create({
          data: {
            actaId: acta.id,
            elementoId: n.elementoId ?? null,
            descripcion: n.descripcion.trim(),
            valorDano: n.valorDano,
            tratamiento: n.tratamiento,
          },
        });
        creadas.push({
          id: fila.id,
          elementoId: fila.elementoId,
          descripcion: fila.descripcion,
          valorDano: fila.valorDano,
          tratamiento: fila.tratamiento,
        });
      }
      await tx.historialEstadoSolicitud.create({
        data: {
          solicitudId: solicitud.id,
          estadoAnterior: solicitud.estado,
          estadoNuevo: destino,
          usuarioId: usuario.id,
          observacion: consecutivo,
        },
      });
      await tx.bitacora.create({
        data: {
          usuarioId: usuario.id,
          accion: datos.tipo === 'ENTREGA' ? 'ACTA_ENTREGA_REGISTRADA' : 'ACTA_DEVOLUCION_REGISTRADA',
          entidad: 'Acta',
          entidadId: acta.id,
          ip: contexto.ip,
          userAgent: contexto.userAgent,
          correlacionId: contexto.correlacionId,
          datosDespues: {
            consecutivo,
            solicitudId: solicitud.id,
            elementosConProblema: checklist.filter((c) => !c.ok).length,
            novedades: creadas.length,
            valorDanos: creadas.reduce((suma, n) => suma + n.valorDano, 0),
          },
        },
      });
      return {
        id: acta.id,
        consecutivo,
        solicitudId: solicitud.id,
        tipo: datos.tipo,
        estadoSolicitud: destino,
        checklist,
        observaciones,
        novedades: creadas,
        generadaEn: acta.generadaEn.toISOString(),
      };
    });
    const etiqueta = solicitud.consecutivo ?? 'tu solicitud';
    await this.notificaciones.notificarSolicitante(solicitud.id, {
      titulo:
        datos.tipo === 'ENTREGA'
          ? `Entrega del espacio de ${etiqueta}`
          : `Devolución del espacio de ${etiqueta}`,
      cuerpo: `Se registró el acta ${registrada.consecutivo}. Puedes consultarla desde el detalle de la solicitud.`,
    });
    return registrada;
  }

  /** Su solicitante, el responsable del espacio, administración y auditoría; cualquier otro recibe 404. */
  async obtener(id: string, usuario: UsuarioAutenticado): Promise<ActaDto> {
    const global = usuario.roles.includes(Rol.ADMINISTRADOR) || usuario.roles.includes(Rol.AUDITOR);
    const acta = await this.prisma.acta.findFirst({
      where: {
        id,
        solicitud: {
          OR: [
            { solicitante: { usuarioId: usuario.id } },
            { reservas: { some: { espacio: { responsableId: usuario.id } } } },
            ...(global ? [{}] : []),
          ],
        },
      },
      include: { novedades: true, solicitud: { select: { estado: true } } },
    });
    if (!acta) throw noEncontrado('El acta');
    return {
      id: acta.id,
      consecutivo: acta.consecutivo,
      solicitudId: acta.solicitudId,
      tipo: acta.tipo,
      estadoSolicitud: acta.solicitud.estado,
      checklist: acta.checklist as unknown as ItemChecklistDto[],
      observaciones: acta.observaciones,
      novedades: acta.novedades.map((n) => ({
        id: n.id,
        elementoId: n.elementoId,
        descripcion: n.descripcion,
        valorDano: n.valorDano,
        tratamiento: n.tratamiento,
      })),
      generadaEn: acta.generadaEn.toISOString(),
    };
  }
}
