import { Injectable } from '@nestjs/common';
import { ErrorDominio, noEncontrado } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { fechaLocal } from '../../../shared/tiempo/zona-horaria.js';
import { primerInicioReservable } from '../../reservas/dominio/reglas-franja.js';
import type { ConsultaDisponibilidadDto } from '../dto/consulta-disponibilidad.dto.js';
import type { DisponibilidadDto, EstadoFranjaPublica } from '../dto/respuestas.js';

const MS_POR_DIA = 86_400_000;
export const MAXIMO_DIAS_CONSULTA = 62;
const ETIQUETA_OCUPADO = 'Ocupado';

interface FilaFranja {
  inicio: Date;
  fin: Date;
  estado: EstadoFranjaPublica;
  etiquetaPublica: string | null;
}

function rangoInvalido(mensaje: string): ErrorDominio {
  return new ErrorDominio('RANGO_INVALIDO', mensaje, 400);
}

@Injectable()
export class DisponibilidadService {
  constructor(private readonly prisma: PrismaService) {}

  async consultar(consulta: ConsultaDisponibilidadDto): Promise<DisponibilidadDto> {
    const desde = new Date(consulta.desde);
    const hasta = new Date(consulta.hasta);
    if (hasta <= desde) {
      throw rangoInvalido('La fecha final debe ser posterior a la inicial.');
    }
    if (hasta.getTime() - desde.getTime() > MAXIMO_DIAS_CONSULTA * MS_POR_DIA) {
      throw rangoInvalido(`El rango consultado no puede superar ${MAXIMO_DIAS_CONSULTA} días.`);
    }

    const espacio = await this.prisma.espacio.findFirst({
      where: { id: consulta.espacioId, archivadoEn: null, esReservable: true },
      select: {
        id: true,
        horarios: { select: { diaSemana: true, abre: true, cierra: true }, orderBy: { diaSemana: 'asc' } },
        tipo: { select: { anticipacionMinimaDias: true, anticipacionEnHabiles: true } },
      },
    });
    if (!espacio) throw noEncontrado('El espacio');

    const ahora = new Date();
    const festivos = espacio.tipo.anticipacionEnHabiles
      ? await this.prisma.festivo.findMany({
          where: {
            fecha: {
              gte: new Date(`${fechaLocal(ahora)}T00:00:00.000Z`),
              lte: new Date(
                `${fechaLocal(new Date(ahora.getTime() + (espacio.tipo.anticipacionMinimaDias * 3 + 30) * MS_POR_DIA))}T00:00:00.000Z`,
              ),
            },
          },
          select: { fecha: true },
        })
      : [];
    const reservableDesde = primerInicioReservable(
      ahora,
      espacio.tipo,
      festivos.map((f) => f.fecha.toISOString().slice(0, 10)),
    );

    const filas = await this.prisma.$queryRaw<FilaFranja[]>`
      SELECT inicio, fin, estado::text AS estado, etiqueta_publica AS "etiquetaPublica"
      FROM franja_ocupada
      WHERE espacio_id = ${espacio.id}::uuid
        AND estado <> 'LIBERADA'
        AND periodo && tstzrange(${desde}::timestamptz, ${hasta}::timestamptz, '[)')
      ORDER BY inicio ASC, fin ASC`;

    return {
      espacioId: espacio.id,
      desde: desde.toISOString(),
      hasta: hasta.toISOString(),
      franjas: filas.map((fila) => ({
        inicio: fila.inicio.toISOString(),
        fin: fila.fin.toISOString(),
        estado: fila.estado,
        etiqueta: fila.etiquetaPublica?.trim() || ETIQUETA_OCUPADO,
      })),
      horarios: espacio.horarios.map((h) => ({ diaSemana: h.diaSemana, abre: h.abre, cierra: h.cierra })),
      reservableDesde: reservableDesde.toISOString(),
    };
  }
}
