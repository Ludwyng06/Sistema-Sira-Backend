import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EstadoSolicitud, ResultadoDecision, Rol, TipoDecision } from '../../../generated/prisma/enums.js';
import { ParametroService } from '../../../shared/parametros/parametro.service.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { NotificacionesService } from '../../notificaciones/services/notificaciones.service.js';

export interface ResultadoRecordatorios {
  recordatorios: number;
  escalamientos: number;
}

const MS_HORA = 3_600_000;
export const ACCION_RECORDATORIO = 'RECORDATORIO_REVISION';
export const ACCION_ESCALAMIENTO = 'ESCALAMIENTO_REVISION';

/**
 * RN-02a: el aprobador (o el responsable, si falta su aval) recibe un recordatorio a las 24 h de haberse
 * enviado la solicitud y, a las 48 h, se escala a administración, ambos antes de que venza el plazo de 72 h.
 * Cada aviso se registra una sola vez en la bitácora, que sirve para no repetirlo.
 */
@Injectable()
export class RecordatoriosService {
  private readonly logger = new Logger(RecordatoriosService.name);
  private enCurso = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametroService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  @Cron('0 */5 * * * *')
  async programado(): Promise<void> {
    if (this.enCurso) return;
    this.enCurso = true;
    try {
      const r = await this.ejecutar();
      if (r.recordatorios > 0 || r.escalamientos > 0) {
        this.logger.log(`Recordatorios: ${r.recordatorios}; escalamientos: ${r.escalamientos}.`);
      }
    } catch (error) {
      this.logger.error('Falló el job de recordatorios.', error instanceof Error ? error.stack : String(error));
    } finally {
      this.enCurso = false;
    }
  }

  async ejecutar(ahora: Date = new Date()): Promise<ResultadoRecordatorios> {
    const [horasRecordatorio, horasEscalamiento] = await Promise.all([
      this.parametros.obtenerNumero('horas_recordatorio_aprobador'),
      this.parametros.obtenerNumero('horas_escalamiento_aprobador'),
    ]);
    const limiteRecordatorio = new Date(ahora.getTime() - horasRecordatorio * MS_HORA);
    const limiteEscalamiento = new Date(ahora.getTime() - horasEscalamiento * MS_HORA);

    const candidatas = await this.prisma.solicitud.findMany({
      where: {
        estado: EstadoSolicitud.EN_REVISION,
        enviadaEn: { not: null, lte: limiteRecordatorio },
        venceEn: { gt: ahora },
      },
      select: {
        id: true,
        consecutivo: true,
        enviadaEn: true,
        reservas: {
          select: { espacio: { select: { responsableId: true, dependenciaId: true, requiereAval: true } } },
        },
        decisiones: { select: { tipo: true, resultado: true, decididaEn: true } },
      },
    });
    if (candidatas.length === 0) return { recordatorios: 0, escalamientos: 0 };

    const ya = await this.prisma.bitacora.findMany({
      where: {
        entidad: 'Solicitud',
        accion: { in: [ACCION_RECORDATORIO, ACCION_ESCALAMIENTO] },
        entidadId: { in: candidatas.map((c) => c.id) },
      },
      select: { accion: true, entidadId: true },
    });
    const avisados = new Set(ya.map((f) => `${f.accion}:${f.entidadId}`));

    let recordatorios = 0;
    let escalamientos = 0;
    for (const solicitud of candidatas) {
      const etiqueta = solicitud.consecutivo ?? 'sin consecutivo';
      const enlace = `/solicitudes/${solicitud.id}`;
      try {
        if (!avisados.has(`${ACCION_RECORDATORIO}:${solicitud.id}`)) {
          await this.recordar(solicitud, etiqueta, enlace);
          await this.registrar(ACCION_RECORDATORIO, solicitud.id, ahora);
          recordatorios += 1;
        }
        const escala = solicitud.enviadaEn !== null && solicitud.enviadaEn <= limiteEscalamiento;
        if (escala && !avisados.has(`${ACCION_ESCALAMIENTO}:${solicitud.id}`)) {
          await this.escalar(etiqueta, enlace);
          await this.registrar(ACCION_ESCALAMIENTO, solicitud.id, ahora);
          escalamientos += 1;
        }
      } catch (error) {
        this.logger.error(
          `No se pudo recordar la solicitud ${solicitud.id}.`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    return { recordatorios, escalamientos };
  }

  private async recordar(
    solicitud: {
      enviadaEn: Date | null;
      reservas: { espacio: { responsableId: string | null; dependenciaId: string | null; requiereAval: boolean } }[];
      decisiones: { tipo: string; resultado: string; decididaEn: Date }[];
    },
    etiqueta: string,
    enlace: string,
  ): Promise<void> {
    const requiereAval = solicitud.reservas.some((r) => r.espacio.requiereAval);
    const avalOtorgado = solicitud.decisiones.some(
      (d) =>
        d.tipo === TipoDecision.AVAL &&
        d.resultado === ResultadoDecision.APROBADA &&
        (solicitud.enviadaEn === null || d.decididaEn >= solicitud.enviadaEn),
    );

    if (requiereAval && !avalOtorgado) {
      const responsables = [
        ...new Set(solicitud.reservas.map((r) => r.espacio.responsableId).filter((v): v is string => !!v)),
      ];
      await Promise.all(
        responsables.map((id) =>
          this.notificaciones.notificarUsuario(id, {
            titulo: `Recordatorio: solicitud ${etiqueta} espera tu aval`,
            cuerpo: 'Hace más de un día que la solicitud está en revisión. Registra tu decisión antes de que venza.',
            enlace,
          }),
        ),
      );
      return;
    }
    const dependencias = solicitud.reservas
      .map((r) => r.espacio.dependenciaId)
      .filter((d): d is string => d !== null);
    await this.notificaciones.notificarAprobadores(dependencias, {
      titulo: `Recordatorio: solicitud ${etiqueta} espera tu aprobación`,
      cuerpo: 'Hace más de un día que la solicitud está en revisión. Registra tu decisión antes de que venza.',
      enlace,
    });
  }

  private async escalar(etiqueta: string, enlace: string): Promise<void> {
    const administradores = await this.prisma.usuarioRol.findMany({
      where: { rol: Rol.ADMINISTRADOR, usuario: { activo: true } },
      select: { usuarioId: true },
    });
    await Promise.all(
      [...new Set(administradores.map((a) => a.usuarioId))].map((id) =>
        this.notificaciones.notificarUsuario(id, {
          titulo: `Escalamiento: solicitud ${etiqueta} sin decisión`,
          cuerpo: 'La solicitud lleva más de dos días en revisión y se vencerá pronto. Gestiona la decisión.',
          enlace,
        }),
      ),
    );
  }

  private async registrar(accion: string, solicitudId: string, ahora: Date): Promise<void> {
    await this.prisma.bitacora.create({
      data: { usuarioId: null, accion, entidad: 'Solicitud', entidadId: solicitudId, ocurrioEn: ahora },
    });
  }
}
