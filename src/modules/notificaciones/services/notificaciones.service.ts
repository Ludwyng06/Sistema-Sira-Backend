import { Inject, Injectable, Logger } from '@nestjs/common';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { noEncontrado } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { CORREO, type CorreoPort } from '../correo/correo.port.js';
import type {
  FiltrosNotificacionesDto,
  NotificacionDto,
  PaginaNotificacionesDto,
} from '../dto/notificacion.dto.js';

export interface ContenidoNotificacion {
  titulo: string;
  cuerpo: string;
  enlace?: string;
}

/** Un servidor SMTP lento no debe retener la respuesta HTTP del cambio de estado que originó el aviso. */
export const TIEMPO_MAXIMO_CORREO_MS = 8_000;

function escaparHtml(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CORREO) private readonly correo: CorreoPort,
  ) {}

  /**
   * Notificación en la aplicación y correo. Nunca lanza: una falla al notificar no debe deshacer
   * el cambio de estado que la originó; queda en el registro para reintentar a mano.
   */
  async notificarUsuario(usuarioId: string, contenido: ContenidoNotificacion): Promise<void> {
    try {
      const usuario = await this.prisma.usuario.findUnique({
        where: { id: usuarioId },
        select: { correo: true, activo: true },
      });
      if (!usuario?.activo) return;
      await this.prisma.notificacion.create({
        data: {
          usuarioId,
          titulo: contenido.titulo,
          cuerpo: contenido.cuerpo,
          enlace: contenido.enlace ?? null,
        },
      });
      await this.conLimite(
        this.correo.enviar({
          para: usuario.correo,
          asunto: contenido.titulo,
          texto: contenido.cuerpo,
          html: `<p>${escaparHtml(contenido.cuerpo)}</p>`,
        }),
        TIEMPO_MAXIMO_CORREO_MS,
      );
    } catch (error) {
      this.logger.error(
        `No se pudo notificar al usuario ${usuarioId}: ${contenido.titulo}.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async conLimite(promesa: Promise<void>, ms: number): Promise<void> {
    let temporizador: NodeJS.Timeout | undefined;
    const limite = new Promise<never>((_, rechazar) => {
      temporizador = setTimeout(() => rechazar(new Error(`El envío del correo superó ${ms} ms.`)), ms);
    });
    promesa.catch(() => undefined);
    try {
      await Promise.race([promesa, limite]);
    } finally {
      clearTimeout(temporizador);
    }
  }

  /** Notifica a quien creó la solicitud. */
  async notificarSolicitante(solicitudId: string, contenido: ContenidoNotificacion): Promise<void> {
    try {
      const solicitud = await this.prisma.solicitud.findUnique({
        where: { id: solicitudId },
        select: { solicitante: { select: { usuarioId: true } } },
      });
      if (!solicitud) return;
      await this.notificarUsuario(solicitud.solicitante.usuarioId, {
        enlace: `/solicitudes/${solicitudId}`,
        ...contenido,
      });
    } catch (error) {
      this.logger.error(
        `No se pudo notificar al solicitante de ${solicitudId}.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Notifica al jefe de cada dependencia y a quienes tienen el rol APROBADOR sobre ella. */
  async notificarAprobadores(dependenciaIds: string[], contenido: ContenidoNotificacion): Promise<void> {
    const ids = [...new Set(dependenciaIds)];
    if (ids.length === 0) return;
    try {
      const [jefes, roles] = await Promise.all([
        this.prisma.dependencia.findMany({
          where: { id: { in: ids }, jefeId: { not: null } },
          select: { jefeId: true },
        }),
        this.prisma.usuarioRol.findMany({
          where: { rol: 'APROBADOR', dependenciaId: { in: ids } },
          select: { usuarioId: true },
        }),
      ]);
      const destinatarios = new Set<string>();
      for (const j of jefes) if (j.jefeId) destinatarios.add(j.jefeId);
      for (const r of roles) destinatarios.add(r.usuarioId);
      await Promise.all([...destinatarios].map((id) => this.notificarUsuario(id, contenido)));
    } catch (error) {
      this.logger.error(
        'No se pudo notificar a los aprobadores.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async listar(filtros: FiltrosNotificacionesDto, usuario: UsuarioAutenticado): Promise<PaginaNotificacionesDto> {
    const base = { usuarioId: usuario.id };
    const where = filtros.soloNoLeidas ? { ...base, leidaEn: null } : base;
    const [total, noLeidas, filas] = await Promise.all([
      this.prisma.notificacion.count({ where }),
      this.prisma.notificacion.count({ where: { ...base, leidaEn: null } }),
      this.prisma.notificacion.findMany({
        where,
        orderBy: { creadaEn: 'desc' },
        skip: (filtros.pagina - 1) * filtros.porPagina,
        take: filtros.porPagina,
      }),
    ]);
    const datos: NotificacionDto[] = filas.map((f) => ({
      id: f.id,
      titulo: f.titulo,
      cuerpo: f.cuerpo,
      enlace: f.enlace,
      leida: f.leidaEn !== null,
      creadaEn: f.creadaEn.toISOString(),
    }));
    return { datos, total, noLeidas, pagina: filtros.pagina, porPagina: filtros.porPagina };
  }

  async marcarLeida(id: string, usuario: UsuarioAutenticado): Promise<void> {
    const { count } = await this.prisma.notificacion.updateMany({
      where: { id, usuarioId: usuario.id, leidaEn: null },
      data: { leidaEn: new Date() },
    });
    if (count > 0) return;
    const existe = await this.prisma.notificacion.findFirst({
      where: { id, usuarioId: usuario.id },
      select: { id: true },
    });
    if (!existe) throw noEncontrado('La notificación');
  }
}
