import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { noEncontrado } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { fechaLocal } from '../../../shared/tiempo/zona-horaria.js';
import { evaluarAforo, ordenarPorAjuste } from '../dominio/aforo.js';
import type { FiltrosEspaciosDto } from '../dto/filtros-espacios.dto.js';
import type {
  BloqueDetalleDto,
  BloqueResumenDto,
  ConteoPorTipoDto,
  FichaEspacioDto,
  FotoDto,
  PaginaEspaciosDto,
  PisoDto,
  SedeResumenDto,
  TarjetaEspacioDto,
  TipoEspacioDto,
} from '../dto/respuestas.js';

const MAXIMO_DOTACION_EN_TARJETA = 4;

/**
 * RN-16: un espacio es visible al público si no está archivado, es reservable,
 * no está fuera de servicio y su bloque y su sede están activos.
 */
export const ESPACIO_VISIBLE = {
  archivadoEn: null,
  esReservable: true,
  estado: { not: 'FUERA_DE_SERVICIO' },
  bloque: { activo: true, sede: { activa: true } },
} satisfies Prisma.EspacioWhereInput;

/** Datos mínimos para armar una tarjeta. Nunca incluye responsable ni solicitantes. */
function incluirTarjeta(hoy: Date) {
  return {
    tipo: true,
    bloque: { include: { sede: true } },
    fotografias: {
      orderBy: [{ esPortada: 'desc' }, { orden: 'asc' }],
      take: 1,
    },
    elementos: {
      where: { estado: 'EN_SERVICIO', cantidad: { gt: 0 } },
      orderBy: { nombre: 'asc' },
      take: MAXIMO_DOTACION_EN_TARJETA,
    },
    tarifas: {
      // La tarifa INTERNO nunca se muestra ni entra en `tarifaDesde`.
      where: {
        tipoSolicitante: { not: 'INTERNO' },
        vigenciaDesde: { lte: hoy },
        OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: hoy } }],
      },
      orderBy: { valor: 'asc' },
    },
  } satisfies Prisma.EspacioInclude;
}

type EspacioConTarjeta = Prisma.EspacioGetPayload<{ include: ReturnType<typeof incluirTarjeta> }>;

@Injectable()
export class InventarioPublicoService {
  constructor(private readonly prisma: PrismaService) {}

  async listarSedes(): Promise<SedeResumenDto[]> {
    const sedes = await this.prisma.sede.findMany({
      where: { activa: true },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
      include: {
        bloques: {
          where: { activo: true },
          include: { espacios: { where: ESPACIO_VISIBLE, select: { id: true } } },
        },
      },
    });
    return sedes.map((sede) => ({
      codigo: sede.codigo,
      nombre: sede.nombre,
      municipio: sede.municipio,
      direccion: sede.direccion,
      totalBloques: sede.bloques.length,
      totalEspacios: sede.bloques.reduce((suma, bloque) => suma + bloque.espacios.length, 0),
    }));
  }

  async listarBloques(codigoSede: string): Promise<BloqueResumenDto[]> {
    const sede = await this.prisma.sede.findFirst({
      where: { codigo: codigoSede.toUpperCase(), activa: true },
      select: { id: true },
    });
    if (!sede) throw noEncontrado('La sede');

    const bloques = await this.prisma.bloque.findMany({
      where: { sedeId: sede.id, activo: true },
      orderBy: [{ orden: 'asc' }, { codigo: 'asc' }],
      include: {
        espacios: {
          where: ESPACIO_VISIBLE,
          orderBy: { codigo: 'asc' },
          include: {
            tipo: true,
            fotografias: { orderBy: [{ esPortada: 'desc' }, { orden: 'asc' }], take: 1 },
          },
        },
      },
    });

    return bloques.map((bloque) => ({
      codigo: bloque.codigo,
      nombre: bloque.nombre,
      descripcion: bloque.descripcion,
      numeroPisos: bloque.numeroPisos,
      planoUrl: bloque.planoUrl,
      foto: this.portada(bloque.espacios.flatMap((espacio) => espacio.fotografias)),
      totalEspacios: bloque.espacios.length,
      capacidadMaxima: bloque.espacios.reduce(
        (maxima, espacio) => Math.max(maxima, espacio.capacidadPersonas),
        0,
      ),
      conteoPorTipo: this.contarPorTipo(bloque.espacios.map((espacio) => espacio.tipo)),
    }));
  }

  async obtenerBloque(
    codigoSede: string,
    codigoBloque: string,
    asistentes?: number,
  ): Promise<BloqueDetalleDto> {
    const hoy = this.hoy();
    const bloque = await this.prisma.bloque.findFirst({
      where: {
        codigo: codigoBloque.toUpperCase(),
        activo: true,
        sede: { codigo: codigoSede.toUpperCase(), activa: true },
      },
      include: {
        sede: true,
        espacios: {
          where: ESPACIO_VISIBLE,
          orderBy: [{ piso: 'asc' }, { codigo: 'asc' }],
          include: incluirTarjeta(hoy),
        },
      },
    });
    if (!bloque) throw noEncontrado('El bloque');

    let espacios = bloque.espacios;
    if (asistentes !== undefined) {
      espacios = ordenarPorAjuste(
        espacios.filter((espacio) => espacio.capacidadPersonas >= asistentes),
        asistentes,
      );
    }

    const porPiso = new Map<number, TarjetaEspacioDto[]>();
    for (const espacio of espacios) {
      const lista = porPiso.get(espacio.piso) ?? [];
      lista.push(this.tarjeta(espacio, asistentes));
      porPiso.set(espacio.piso, lista);
    }
    const pisos: PisoDto[] = [...porPiso.entries()]
      .sort(([a], [b]) => a - b)
      .map(([piso, lista]) => ({ piso, espacios: lista }));

    return {
      codigo: bloque.codigo,
      nombre: bloque.nombre,
      descripcion: bloque.descripcion,
      sede: { codigo: bloque.sede.codigo, nombre: bloque.sede.nombre },
      numeroPisos: bloque.numeroPisos,
      planoUrl: bloque.planoUrl,
      tipos: this.contarPorTipo(espacios.map((espacio) => espacio.tipo)),
      pisos,
    };
  }

  async buscarEspacios(filtros: FiltrosEspaciosDto): Promise<PaginaEspaciosDto> {
    const hoy = this.hoy();
    const { asistentes, pagina, porPagina } = filtros;

    const where: Prisma.EspacioWhereInput = {
      ...ESPACIO_VISIBLE,
      bloque: {
        activo: true,
        ...(filtros.bloque ? { codigo: filtros.bloque.toUpperCase() } : {}),
        sede: {
          activa: true,
          ...(filtros.sede ? { codigo: filtros.sede.toUpperCase() } : {}),
        },
      },
      ...(filtros.tipo ? { tipo: { codigo: filtros.tipo.toUpperCase() } } : {}),
      // Con asistentes se ocultan los espacios donde no caben.
      ...(asistentes !== undefined ? { capacidadPersonas: { gte: asistentes } } : {}),
    };

    if (asistentes === undefined) {
      const [total, espacios] = await Promise.all([
        this.prisma.espacio.count({ where }),
        this.prisma.espacio.findMany({
          where,
          orderBy: [{ bloque: { codigo: 'asc' } }, { piso: 'asc' }, { codigo: 'asc' }],
          skip: (pagina - 1) * porPagina,
          take: porPagina,
          include: incluirTarjeta(hoy),
        }),
      ]);
      return {
        datos: espacios.map((espacio) => this.tarjeta(espacio)),
        total,
        pagina,
        porPagina,
      };
    }

    // El orden por ajuste es una regla de dominio, no de SQL: se aplica en memoria.
    const todos = await this.prisma.espacio.findMany({ where, include: incluirTarjeta(hoy) });
    const ordenados = ordenarPorAjuste(todos, asistentes);
    const pagina_ = ordenados.slice((pagina - 1) * porPagina, pagina * porPagina);
    return {
      datos: pagina_.map((espacio) => this.tarjeta(espacio, asistentes)),
      total: ordenados.length,
      pagina,
      porPagina,
    };
  }

  async obtenerEspacio(codigo: string): Promise<FichaEspacioDto> {
    const hoy = this.hoy();
    const espacio = await this.prisma.espacio.findFirst({
      where: { ...ESPACIO_VISIBLE, codigo: codigo.toUpperCase() },
      include: {
        ...incluirTarjeta(hoy),
        // En la ficha se muestran todas las fotos y toda la dotación en servicio.
        fotografias: { orderBy: [{ esPortada: 'desc' }, { orden: 'asc' }] },
        elementos: {
          where: { estado: 'EN_SERVICIO', cantidad: { gt: 0 } },
          orderBy: { nombre: 'asc' },
        },
        horarios: { orderBy: { diaSemana: 'asc' } },
      },
    });
    if (!espacio) throw noEncontrado('El espacio');

    return {
      ...this.tarjeta({
        ...espacio,
        elementos: espacio.elementos.slice(0, MAXIMO_DOTACION_EN_TARJETA),
      }),
      descripcion: espacio.descripcion,
      condicionesUso: espacio.condicionesUso,
      areaM2: espacio.areaM2 === null ? null : Number(espacio.areaM2),
      minutosMontaje: espacio.minutosMontaje,
      minutosDesmontaje: espacio.minutosDesmontaje,
      depositoValorFijo: espacio.depositoValorFijo,
      depositoPorcentaje:
        espacio.depositoPorcentaje === null ? null : Number(espacio.depositoPorcentaje),
      fotos: espacio.fotografias.map((foto) => ({
        urlDetalle: foto.urlDetalle,
        urlTarjeta: foto.urlTarjeta,
        urlMiniatura: foto.urlMiniatura,
        alt: foto.textoAlternativo,
        esPortada: foto.esPortada,
      })),
      elementos: espacio.elementos.map((elemento) => ({
        nombre: elemento.nombre,
        cantidad: elemento.cantidad,
        unidad: elemento.unidad,
      })),
      tarifas: espacio.tarifas.map((tarifa) => ({
        tipoSolicitante: tarifa.tipoSolicitante,
        unidad: tarifa.unidad,
        valor: tarifa.valor,
        ivaAplica: tarifa.ivaAplica,
      })),
      horarios: espacio.horarios.map((horario) => ({
        diaSemana: horario.diaSemana,
        abre: horario.abre,
        cierra: horario.cierra,
      })),
      reglasTipo: this.tipoEspacio(espacio.tipo),
    };
  }

  async listarTipos(): Promise<TipoEspacioDto[]> {
    const tipos = await this.prisma.tipoEspacio.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    });
    return tipos.map((tipo) => this.tipoEspacio(tipo));
  }

  // ---------------------------------------------------------------------------

  private hoy(): Date {
    return new Date(`${fechaLocal(new Date())}T00:00:00Z`);
  }

  private tipoEspacio(tipo: {
    codigo: string;
    nombre: string;
    anticipacionMinimaDias: number;
    anticipacionEnHabiles: boolean;
    aforoExigePoliza: number | null;
    icono: string | null;
  }): TipoEspacioDto {
    return {
      codigo: tipo.codigo,
      nombre: tipo.nombre,
      anticipacionMinimaDias: tipo.anticipacionMinimaDias,
      anticipacionEnHabiles: tipo.anticipacionEnHabiles,
      aforoExigePoliza: tipo.aforoExigePoliza,
      icono: tipo.icono,
    };
  }

  private portada(
    fotografias: { urlTarjeta: string; textoAlternativo: string; esPortada?: boolean }[],
  ): FotoDto | null {
    const foto = fotografias.find((f) => f.esPortada) ?? fotografias[0];
    return foto ? { url: foto.urlTarjeta, alt: foto.textoAlternativo } : null;
  }

  private contarPorTipo(tipos: { codigo: string; nombre: string }[]): ConteoPorTipoDto[] {
    const conteo = new Map<string, ConteoPorTipoDto>();
    for (const tipo of tipos) {
      const actual = conteo.get(tipo.codigo);
      if (actual) actual.total += 1;
      else conteo.set(tipo.codigo, { tipo: tipo.codigo, nombre: tipo.nombre, total: 1 });
    }
    return [...conteo.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  private tarjeta(espacio: EspacioConTarjeta, asistentes?: number): TarjetaEspacioDto {
    const tarjeta: TarjetaEspacioDto = {
      codigo: espacio.codigo,
      nombre: espacio.nombre,
      piso: espacio.piso,
      capacidadPersonas: espacio.capacidadPersonas,
      tipo: { codigo: espacio.tipo.codigo, nombre: espacio.tipo.nombre },
      bloque: { codigo: espacio.bloque.codigo, nombre: espacio.bloque.nombre },
      sede: { codigo: espacio.bloque.sede.codigo, nombre: espacio.bloque.sede.nombre },
      portada: this.portada(espacio.fotografias),
      dotacion: espacio.elementos
        .slice(0, MAXIMO_DOTACION_EN_TARJETA)
        .map((elemento) => ({ nombre: elemento.nombre, cantidad: elemento.cantidad })),
      tarifaDesde: espacio.tarifas.length > 0 ? espacio.tarifas[0].valor : null,
    };
    if (asistentes !== undefined) {
      tarjeta.aforo = evaluarAforo(espacio.capacidadPersonas, asistentes);
    }
    return tarjeta;
  }
}
