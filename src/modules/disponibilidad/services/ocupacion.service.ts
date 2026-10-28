import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { ErrorDominio, noEncontrado } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { diaSemanaLocal, fechaLocal } from '../../../shared/tiempo/zona-horaria.js';
import type { ConsultaOcupacionDto, OcupacionSedeDto } from '../dto/ocupacion.dto.js';

const MS_DIA = 86_400_000;
export const MAXIMO_DIAS_OCUPACION = 31;

function aHoras(texto: string): number {
  const [h = '0', m = '0'] = texto.split(':');
  return Number(h) + Number(m) / 60;
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}

@Injectable()
export class OcupacionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * RF-CAL: ocupación agregada de una sede o un bloque. Solo cifras: nunca datos de quién reservó.
   * El porcentaje compara las horas ocupadas con las de operación de los espacios (tope 100 %).
   */
  async consultar(consulta: ConsultaOcupacionDto): Promise<OcupacionSedeDto> {
    const desde = new Date(consulta.desde);
    const hasta = new Date(consulta.hasta);
    if (hasta <= desde) {
      throw new ErrorDominio('RANGO_INVALIDO', 'La fecha final debe ser posterior a la inicial.', 400);
    }
    if (hasta.getTime() - desde.getTime() > MAXIMO_DIAS_OCUPACION * MS_DIA) {
      throw new ErrorDominio(
        'RANGO_INVALIDO',
        `El rango consultado no puede superar ${MAXIMO_DIAS_OCUPACION} días.`,
        400,
      );
    }

    const sede = await this.prisma.sede.findFirst({
      where: { codigo: consulta.sede, activa: true },
      select: { id: true, codigo: true, nombre: true },
    });
    if (!sede) throw noEncontrado('La sede');

    let bloque: { id: string; codigo: string; nombre: string } | null = null;
    if (consulta.bloque) {
      bloque = await this.prisma.bloque.findFirst({
        where: { sedeId: sede.id, codigo: consulta.bloque, activo: true },
        select: { id: true, codigo: true, nombre: true },
      });
      if (!bloque) throw noEncontrado('El bloque');
    }

    const espacios = await this.prisma.espacio.findMany({
      where: {
        archivadoEn: null,
        esReservable: true,
        estado: { not: 'FUERA_DE_SERVICIO' },
        bloque: bloque ? { id: bloque.id } : { sedeId: sede.id, activo: true },
      },
      orderBy: { codigo: 'asc' },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        horarios: { select: { diaSemana: true, abre: true, cierra: true } },
      },
    });

    const ids = espacios.map((e) => e.id);
    const filas = ids.length
      ? await this.prisma.$queryRaw<{ espacioId: string; horas: number }[]>`
          SELECT f.espacio_id AS "espacioId",
            COALESCE(SUM(EXTRACT(EPOCH FROM (
              LEAST(f.fin, ${hasta}::timestamptz) - GREATEST(f.inicio, ${desde}::timestamptz)
            )) / 3600), 0)::float AS horas
          FROM franja_ocupada f
          WHERE f.espacio_id IN (${Prisma.join(ids)})
            AND f.estado <> 'LIBERADA'
            AND f.periodo && tstzrange(${desde}::timestamptz, ${hasta}::timestamptz, '[)')
          GROUP BY f.espacio_id`
      : [];
    const ocupadas = new Map(filas.map((f) => [f.espacioId, Number(f.horas)]));

    const dias = this.diasDelRango(desde, hasta);
    const detalle = espacios.map((espacio) => {
      const horasOperacion = dias.reduce((suma, dia) => {
        const horario = espacio.horarios.find((h) => h.diaSemana === dia);
        return horario ? suma + Math.max(0, aHoras(horario.cierra) - aHoras(horario.abre)) : suma;
      }, 0);
      const horasOcupadas = ocupadas.get(espacio.id) ?? 0;
      return {
        codigo: espacio.codigo,
        nombre: espacio.nombre,
        horasOperacion: redondear(horasOperacion),
        horasOcupadas: redondear(horasOcupadas),
        porcentajeOcupacion:
          horasOperacion > 0 ? redondear(Math.min(100, (horasOcupadas / horasOperacion) * 100)) : 0,
      };
    });

    const totalOperacion = detalle.reduce((suma, e) => suma + e.horasOperacion, 0);
    const totalOcupadas = detalle.reduce((suma, e) => suma + e.horasOcupadas, 0);
    return {
      sede: { codigo: sede.codigo, nombre: sede.nombre },
      bloque: bloque ? { codigo: bloque.codigo, nombre: bloque.nombre } : null,
      desde: desde.toISOString(),
      hasta: hasta.toISOString(),
      horasOperacion: redondear(totalOperacion),
      horasOcupadas: redondear(totalOcupadas),
      porcentajeOcupacion:
        totalOperacion > 0 ? redondear(Math.min(100, (totalOcupadas / totalOperacion) * 100)) : 0,
      espacios: detalle,
    };
  }

  /** Día de la semana (0 = domingo) de cada día calendario de Bogotá que toca el rango. */
  private diasDelRango(desde: Date, hasta: Date): number[] {
    const dias: number[] = [];
    const ultimo = fechaLocal(new Date(hasta.getTime() - 1));
    for (let cursor = desde.getTime(); ; cursor += MS_DIA) {
      const instante = new Date(cursor);
      dias.push(diaSemanaLocal(instante));
      if (fechaLocal(instante) >= ultimo) break;
    }
    return dias;
  }
}
