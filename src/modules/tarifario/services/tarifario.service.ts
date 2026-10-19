import { Injectable } from '@nestjs/common';
import type { TipoRecargo, TipoSolicitante, UnidadCobroTarifa } from '../../../generated/prisma/enums.js';
import { ErrorDominio, noEncontrado } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { fechaLocal } from '../../../shared/tiempo/zona-horaria.js';
import {
  calcularTarifaEspacio,
  type RecargosConfigurados,
  TarifaNoDefinidaError,
  type TarifaVigente,
} from '../dominio/calculo.js';

export interface SolicitudCalculo {
  espacioId: string;
  tipoSolicitante: TipoSolicitante;
  inicio: Date;
  fin: Date;
}

export interface TarifaCalculada extends ReturnType<typeof calcularTarifaEspacio> {
  espacioId: string;
  tipoSolicitante: TipoSolicitante;
}

const MS_DIA = 86_400_000;
/** El simulador es público: sin tope, un rango de años genera miles de líneas por petición. */
export const MAXIMO_DIAS_CALCULO = 31;

function rangoInvalido(): ErrorDominio {
  return new ErrorDominio('RANGO_INVALIDO', 'La hora de fin debe ser posterior a la de inicio.', 400);
}

@Injectable()
export class TarifarioService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * RN-05: usa la tarifa vigente en `fechaEmision`. RN-06: resuelve las tarifas
   * en SMMLV con el valor del año de esa fecha.
   */
  async calcular(solicitud: SolicitudCalculo, fechaEmision: Date = new Date()): Promise<TarifaCalculada> {
    if (Number.isNaN(solicitud.inicio.getTime()) || Number.isNaN(solicitud.fin.getTime())) {
      throw rangoInvalido();
    }
    if (solicitud.fin <= solicitud.inicio) throw rangoInvalido();
    if (solicitud.fin.getTime() - solicitud.inicio.getTime() > MAXIMO_DIAS_CALCULO * MS_DIA) {
      throw new ErrorDominio(
        'RANGO_INVALIDO',
        `El horario a calcular no puede superar ${MAXIMO_DIAS_CALCULO} días.`,
        400,
      );
    }

    const espacio = await this.prisma.espacio.findFirst({
      where: { id: solicitud.espacioId, archivadoEn: null, esReservable: true },
      select: { id: true },
    });
    if (!espacio) throw noEncontrado('El espacio');

    const emision = fechaLocal(fechaEmision);
    const fechaDia = new Date(`${emision}T00:00:00.000Z`);
    const filas = await this.prisma.tarifa.findMany({
      where: {
        espacioId: espacio.id,
        tipoSolicitante: solicitud.tipoSolicitante,
        vigenciaDesde: { lte: fechaDia },
        OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: fechaDia } }],
      },
      orderBy: { vigenciaDesde: 'desc' },
    });

    const elegidas = new Map<UnidadCobroTarifa, (typeof filas)[number]>();
    for (const fila of filas) {
      if (fila.unidad && !elegidas.has(fila.unidad)) elegidas.set(fila.unidad, fila);
    }

    let valorSmmlv: number | null = null;
    const tarifas: TarifaVigente[] = [];
    for (const [unidad, fila] of elegidas) {
      let valor = fila.valor;
      if (fila.valorEnSmmlv !== null) {
        if (valorSmmlv === null) {
          const anio = await this.prisma.smmlv.findUnique({ where: { anio: Number(emision.slice(0, 4)) } });
          if (!anio) {
            throw new ErrorDominio(
              'SMMLV_NO_DEFINIDO',
              'No hay un salario mínimo configurado para el año de la cotización.',
              422,
            );
          }
          valorSmmlv = anio.valor;
        }
        valor = Math.round(Number(fila.valorEnSmmlv.toString()) * valorSmmlv);
      }
      tarifas.push({
        unidad,
        valor,
        ivaAplica: fila.ivaAplica,
        porcentajeIva: Number(fila.porcentajeIva.toString()),
      });
    }

    const [festivos, recargos] = await Promise.all([
      this.prisma.festivo.findMany({
        where: {
          fecha: {
            gte: new Date(`${fechaLocal(new Date(solicitud.inicio.getTime() - MS_DIA))}T00:00:00.000Z`),
            lte: new Date(`${fechaLocal(new Date(solicitud.fin.getTime() + MS_DIA))}T00:00:00.000Z`),
          },
        },
        select: { fecha: true },
      }),
      this.prisma.recargo.findMany({ where: { activo: true } }),
    ]);

    const configurados: RecargosConfigurados = {};
    for (const recargo of recargos) {
      configurados[recargo.tipo as TipoRecargo] = {
        porcentaje: Number(recargo.porcentaje.toString()),
        desdeHora: recargo.desdeHora,
      };
    }

    try {
      const resultado = calcularTarifaEspacio({
        inicio: solicitud.inicio,
        fin: solicitud.fin,
        tarifas,
        festivos: new Set(festivos.map((f) => f.fecha.toISOString().slice(0, 10))),
        recargos: configurados,
      });
      return { espacioId: espacio.id, tipoSolicitante: solicitud.tipoSolicitante, ...resultado };
    } catch (error) {
      if (error instanceof TarifaNoDefinidaError) {
        throw new ErrorDominio(
          'TARIFA_NO_DEFINIDA',
          'Este espacio no tiene una tarifa vigente para el horario solicitado. Consulta con la administración.',
          422,
          { fecha: error.fecha },
        );
      }
      throw error;
    }
  }
}
