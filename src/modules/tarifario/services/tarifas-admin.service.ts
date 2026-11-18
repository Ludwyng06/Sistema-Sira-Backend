import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { ErrorDominio, noEncontrado } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { fechaLocal } from '../../../shared/tiempo/zona-horaria.js';
import { MAXIMO_VALOR_PESOS } from '../dto/admin.dto.js';
import type {
  ActualizarTarifaDto,
  CrearTarifaDto,
  FiltrosTarifasDto,
  PaginaTarifasDto,
  TarifaDto,
} from '../dto/admin.dto.js';

const MS_DIA = 86_400_000;

type FilaTarifa = Prisma.TarifaGetPayload<Record<string, never>>;

function tarifaInvalida(mensaje: string): ErrorDominio {
  return new ErrorDominio('TARIFA_INVALIDA', mensaje, 422);
}

function aFecha(iso: string): Date {
  const fecha = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== iso) {
    throw new ErrorDominio('FECHA_INVALIDA', `La fecha ${iso} no es válida.`, 400);
  }
  return fecha;
}

function aDto(fila: FilaTarifa): TarifaDto {
  return {
    id: fila.id,
    espacioId: fila.espacioId,
    servicioId: fila.servicioId,
    tipoSolicitante: fila.tipoSolicitante,
    unidad: fila.unidad,
    valor: fila.valor,
    valorEnSmmlv: fila.valorEnSmmlv === null ? null : Number(fila.valorEnSmmlv.toString()),
    vigenciaDesde: fila.vigenciaDesde.toISOString().slice(0, 10),
    vigenciaHasta: fila.vigenciaHasta?.toISOString().slice(0, 10) ?? null,
    acuerdoSoporte: fila.acuerdoSoporte,
    ivaAplica: fila.ivaAplica,
    porcentajeIva: Number(fila.porcentajeIva.toString()),
    creadoEn: fila.creadoEn.toISOString(),
  };
}

/**
 * Administración de tarifas (RN-05, RN-06). Una tarifa no se edita: cambiar un valor es crear una
 * nueva vigencia, que cierra la anterior. Así las cotizaciones y reportes históricos no cambian.
 */
@Injectable()
export class TarifasAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(datos: CrearTarifaDto): Promise<TarifaDto> {
    if ((datos.espacioId === undefined) === (datos.servicioId === undefined)) {
      throw tarifaInvalida('Indica exactamente uno de espacioId o servicioId.');
    }
    if (datos.espacioId !== undefined && datos.unidad === undefined) {
      throw tarifaInvalida('La tarifa de un espacio exige la unidad de cobro.');
    }
    if (datos.servicioId !== undefined && datos.unidad !== undefined) {
      throw tarifaInvalida('La unidad de una tarifa de servicio la define el servicio; no la envíes.');
    }
    if ((datos.valor === undefined) === (datos.valorEnSmmlv === undefined)) {
      throw tarifaInvalida('Indica exactamente uno de valor (pesos) o valorEnSmmlv.');
    }
    const ivaAplica = datos.ivaAplica ?? false;
    const porcentajeIva = datos.porcentajeIva ?? 0;
    if (ivaAplica && datos.porcentajeIva === undefined) {
      throw tarifaInvalida('Si la tarifa aplica IVA, indica el porcentaje.');
    }
    if (!ivaAplica && porcentajeIva > 0) {
      throw tarifaInvalida('El porcentaje de IVA solo aplica si ivaAplica es verdadero.');
    }

    const desde = aFecha(datos.vigenciaDesde);
    const hasta = datos.vigenciaHasta ? aFecha(datos.vigenciaHasta) : null;
    if (hasta && hasta < desde) {
      throw tarifaInvalida('La vigencia final no puede ser anterior a la inicial.');
    }

    if (datos.espacioId !== undefined) {
      const espacio = await this.prisma.espacio.findFirst({
        where: { id: datos.espacioId, archivadoEn: null },
        select: { id: true },
      });
      if (!espacio) throw noEncontrado('El espacio');
    } else {
      const servicio = await this.prisma.servicioComplementario.findUnique({
        where: { id: datos.servicioId },
        select: { id: true },
      });
      if (!servicio) throw noEncontrado('El servicio');
    }

    let valor = datos.valor ?? 0;
    if (datos.valorEnSmmlv !== undefined) {
      const anio = desde.getUTCFullYear();
      const salario = await this.prisma.smmlv.findUnique({ where: { anio } });
      if (!salario) {
        throw new ErrorDominio(
          'SMMLV_NO_DEFINIDO',
          `No hay un salario mínimo configurado para ${anio}.`,
          422,
        );
      }
      valor = Math.round(datos.valorEnSmmlv * salario.valor);
      if (valor > MAXIMO_VALOR_PESOS) {
        throw tarifaInvalida('El valor resultante en pesos es demasiado alto.');
      }
    }

    const combinacion: Prisma.TarifaWhereInput = {
      espacioId: datos.espacioId ?? null,
      servicioId: datos.servicioId ?? null,
      tipoSolicitante: datos.tipoSolicitante,
      unidad: datos.unidad ?? null,
    };
    const diaAnterior = new Date(desde.getTime() - MS_DIA);

    const creada = await this.prisma.$transaction(async (tx) => {
      // Serializa las altas de la misma combinación: sin esto, dos peticiones a la vez pasan la
      // verificación de solapamiento y dejan dos vigencias abiertas.
      const clave = `tarifa:${datos.espacioId ?? datos.servicioId}:${datos.tipoSolicitante}:${datos.unidad ?? ''}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clave}))`;
      const posterior = await tx.tarifa.findFirst({
        where: { ...combinacion, vigenciaDesde: { gte: desde } },
        select: { id: true },
      });
      if (posterior) {
        throw new ErrorDominio(
          'TARIFA_SOLAPADA',
          'Ya existe una tarifa para esta combinación que empieza en esa fecha o después.',
          409,
        );
      }
      await tx.tarifa.updateMany({
        where: {
          ...combinacion,
          vigenciaDesde: { lt: desde },
          OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: desde } }],
        },
        data: { vigenciaHasta: diaAnterior },
      });
      return tx.tarifa.create({
        data: {
          espacioId: datos.espacioId ?? null,
          servicioId: datos.servicioId ?? null,
          tipoSolicitante: datos.tipoSolicitante,
          unidad: datos.unidad ?? null,
          valor,
          valorEnSmmlv: datos.valorEnSmmlv ?? null,
          vigenciaDesde: desde,
          vigenciaHasta: hasta,
          acuerdoSoporte: datos.acuerdoSoporte?.trim() || null,
          ivaAplica,
          porcentajeIva,
        },
      });
    });
    return aDto(creada);
  }

  /** Solo cierra la vigencia (sin extenderla) y edita el acuerdo de soporte (RN-05). */
  async actualizar(id: string, datos: ActualizarTarifaDto): Promise<TarifaDto> {
    if (datos.vigenciaHasta === undefined && datos.acuerdoSoporte === undefined) {
      throw new ErrorDominio('SIN_CAMBIOS', 'Indica vigenciaHasta o acuerdoSoporte para actualizar.', 422);
    }
    const actual = await this.prisma.tarifa.findUnique({ where: { id } });
    if (!actual) throw noEncontrado('La tarifa');

    const data: Prisma.TarifaUpdateInput = {};
    if (datos.vigenciaHasta !== undefined) {
      const hasta = aFecha(datos.vigenciaHasta);
      if (hasta < actual.vigenciaDesde) {
        throw tarifaInvalida('La vigencia final no puede ser anterior a la inicial.');
      }
      if (actual.vigenciaHasta !== null && hasta > actual.vigenciaHasta) {
        throw tarifaInvalida('Solo se puede cerrar la vigencia antes; para extenderla crea una tarifa nueva.');
      }
      data.vigenciaHasta = hasta;
    }
    if (datos.acuerdoSoporte !== undefined) data.acuerdoSoporte = datos.acuerdoSoporte.trim() || null;

    const fila = await this.prisma.tarifa.update({ where: { id }, data });
    return aDto(fila);
  }

  async listar(filtros: FiltrosTarifasDto, ahora: Date = new Date()): Promise<PaginaTarifasDto> {
    const hoy = new Date(`${fechaLocal(ahora)}T00:00:00.000Z`);
    const where: Prisma.TarifaWhereInput = {
      ...(filtros.espacioId ? { espacioId: filtros.espacioId } : {}),
      ...(filtros.servicioId ? { servicioId: filtros.servicioId } : {}),
      ...(filtros.tipoSolicitante ? { tipoSolicitante: filtros.tipoSolicitante } : {}),
      ...(filtros.vigentes
        ? { vigenciaDesde: { lte: hoy }, OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: hoy } }] }
        : {}),
    };
    const [total, filas] = await Promise.all([
      this.prisma.tarifa.count({ where }),
      this.prisma.tarifa.findMany({
        where,
        orderBy: [{ vigenciaDesde: 'desc' }, { creadoEn: 'desc' }],
        skip: (filtros.pagina - 1) * filtros.porPagina,
        take: filtros.porPagina,
      }),
    ]);
    return { datos: filas.map(aDto), total, pagina: filtros.pagina, porPagina: filtros.porPagina };
  }
}
