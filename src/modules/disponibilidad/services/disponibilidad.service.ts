import { Injectable } from '@nestjs/common';
import { ErrorDominio, noEncontrado } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
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
      select: { id: true },
    });
    if (!espacio) throw noEncontrado('El espacio');

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
    };
  }
}
