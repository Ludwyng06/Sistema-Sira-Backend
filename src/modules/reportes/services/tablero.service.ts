import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { EstadoOrdenPago, Rol } from '../../../generated/prisma/enums.js';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { ConsultaTableroDto, OcupacionEspacioDto, TableroDto } from '../dto/tablero.dto.js';

const MS_DIA = 86_400_000;
const DIAS_POR_DEFECTO = 30;
const DIAS_MAXIMOS = 366;
const ESPACIOS_MAS_USADOS = 10;

const ROLES_GLOBALES: Rol[] = [Rol.ADMINISTRADOR, Rol.TESORERIA, Rol.AUDITOR];

export interface FilaOcupacion {
  espacioId: string;
  codigo: string;
  nombre: string;
  reservadas: number;
  bloqueadas: number;
}

function redondear(valor: number, decimales = 2): number {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}

@Injectable()
export class TableroService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * RF-REP-01. El tablero solo lee. Administración, tesorería y auditoría ven todo; el aprobador
   * ve únicamente lo de las dependencias de su alcance.
   */
  async obtener(
    consulta: ConsultaTableroDto,
    usuario: UsuarioAutenticado,
    ahora: Date = new Date(),
  ): Promise<TableroDto> {
    const hasta = consulta.hasta ? new Date(consulta.hasta) : ahora;
    const desde = consulta.desde ? new Date(consulta.desde) : new Date(hasta.getTime() - DIAS_POR_DEFECTO * MS_DIA);
    if (hasta <= desde) {
      throw new ErrorDominio('RANGO_INVALIDO', 'La fecha final debe ser posterior a la inicial.', 400);
    }
    if (hasta.getTime() - desde.getTime() > DIAS_MAXIMOS * MS_DIA) {
      throw new ErrorDominio('RANGO_INVALIDO', `El periodo no puede superar ${DIAS_MAXIMOS} días.`, 400);
    }

    const global = usuario.roles.some((rol) => ROLES_GLOBALES.includes(rol));
    const dependencias = global ? null : usuario.dependencias;
    const soloDependencias: Prisma.SolicitudWhereInput = dependencias ? { dependenciaId: { in: dependencias } } : {};

    const [porEstado, ocupacion, recaudo, aprobacion, exentas] = await Promise.all([
      this.prisma.solicitud.groupBy({
        by: ['estado'],
        where: { creadoEn: { gte: desde, lte: hasta }, ...soloDependencias },
        _count: { _all: true },
      }),
      this.ocupacion(desde, hasta, dependencias),
      this.prisma.ordenPago.aggregate({
        where: {
          estado: EstadoOrdenPago.APROBADA,
          pagadoEn: { gte: desde, lte: hasta },
          cotizacion: { solicitud: soloDependencias },
        },
        _sum: { valor: true },
        _count: { _all: true },
      }),
      this.tiempoMedioAprobacion(desde, hasta, dependencias),
      this.prisma.cotizacion.aggregate({
        where: { esExenta: true, creadaEn: { gte: desde, lte: hasta }, solicitud: soloDependencias },
        _sum: { valorReferencia: true },
        _count: { _all: true },
      }),
    ]);

    const horasReservadas = ocupacion.reduce((suma, f) => suma + f.reservadas, 0);
    const horasBloqueadas = ocupacion.reduce((suma, f) => suma + f.bloqueadas, 0);
    const masUsados: OcupacionEspacioDto[] = [...ocupacion]
      .filter((f) => f.reservadas > 0)
      .sort((a, b) => b.reservadas - a.reservadas)
      .slice(0, ESPACIOS_MAS_USADOS)
      .map((f) => ({
        espacioId: f.espacioId,
        codigo: f.codigo,
        nombre: f.nombre,
        horasReservadas: redondear(f.reservadas),
      }));

    return {
      desde: desde.toISOString(),
      hasta: hasta.toISOString(),
      solicitudesPorEstado: porEstado
        .map((f) => ({ estado: f.estado, cantidad: f._count._all }))
        .sort((a, b) => b.cantidad - a.cantidad || a.estado.localeCompare(b.estado)),
      ocupacion: {
        horasReservadas: redondear(horasReservadas),
        horasBloqueadas: redondear(horasBloqueadas),
        espaciosMasUsados: masUsados,
      },
      recaudo: { total: recaudo._sum.valor ?? 0, ordenesAprobadas: recaudo._count._all },
      tiempoMedioAprobacionHoras: aprobacion === null ? null : redondear(aprobacion, 1),
      usoInternoNoCobrado: {
        valorReferencia: exentas._sum.valorReferencia ?? 0,
        solicitudesExentas: exentas._count._all,
      },
    };
  }

  /** Horas de cada espacio dentro del periodo, recortando las franjas a sus límites. */
  ocupacionPorEspacio(desde: Date, hasta: Date, dependencias: string[] | null): Promise<FilaOcupacion[]> {
    return this.ocupacion(desde, hasta, dependencias);
  }

  private async ocupacion(desde: Date, hasta: Date, dependencias: string[] | null): Promise<FilaOcupacion[]> {
    const filtro = dependencias
      ? Prisma.sql`AND e.dependencia_id = ANY(${dependencias}::uuid[])`
      : Prisma.empty;
    const horas = (estado: string) => Prisma.sql`COALESCE(SUM(
          EXTRACT(EPOCH FROM (
            LEAST(f.fin, ${hasta}::timestamptz) - GREATEST(f.inicio, ${desde}::timestamptz)
          )) / 3600
        ) FILTER (WHERE f.estado = ${estado}), 0)::float`;
    const filas = await this.prisma.$queryRaw<FilaOcupacion[]>`
      SELECT e.id AS "espacioId", e.codigo, e.nombre,
        ${horas('CONFIRMADA')} AS reservadas,
        ${horas('BLOQUEO')} AS bloqueadas
      FROM franja_ocupada f
      JOIN espacio e ON e.id = f.espacio_id
      WHERE f.periodo && tstzrange(${desde}::timestamptz, ${hasta}::timestamptz, '[)')
        AND f.estado IN ('CONFIRMADA', 'BLOQUEO')
        ${filtro}
      GROUP BY e.id, e.codigo, e.nombre`;
    return filas.map((f) => ({
      ...f,
      reservadas: Number(f.reservadas),
      bloqueadas: Number(f.bloqueadas),
    }));
  }

  private async tiempoMedioAprobacion(
    desde: Date,
    hasta: Date,
    dependencias: string[] | null,
  ): Promise<number | null> {
    const filtro = dependencias
      ? Prisma.sql`AND s.dependencia_id = ANY(${dependencias}::uuid[])`
      : Prisma.empty;
    const filas = await this.prisma.$queryRaw<{ horas: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM (d.decidida_en - s.enviada_en)) / 3600)::float AS horas
      FROM decision d
      JOIN solicitud s ON s.id = d.solicitud_id
      WHERE d.tipo = 'APROBACION'
        AND d.resultado IN ('APROBADA', 'RECLASIFICADA')
        AND s.enviada_en IS NOT NULL
        AND d.decidida_en >= ${desde}::timestamptz AND d.decidida_en <= ${hasta}::timestamptz
        ${filtro}`;
    const horas = filas[0]?.horas;
    return horas === null || horas === undefined ? null : Number(horas);
  }
}
