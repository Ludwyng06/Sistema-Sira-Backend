import { Injectable } from '@nestjs/common';
import {
  ErrorDominio,
  noEncontrado,
} from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { ActualizarEspacioDto } from '../dto/actualizar-espacio.dto.js';
import type { CrearEspacioDto } from '../dto/crear-espacio.dto.js';
import type { EspacioCreadoDto } from '../dto/respuestas.js';

@Injectable()
export class EspaciosAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(datos: CrearEspacioDto): Promise<EspacioCreadoDto> {
    const bloque = await this.prisma.bloque.findFirst({
      where: {
        codigo: datos.bloque.toUpperCase(),
        sede: { codigo: datos.sede.toUpperCase() },
      },
      include: { sede: true },
    });
    if (!bloque) {
      throw new ErrorDominio(
        'BLOQUE_NO_ENCONTRADO',
        `No existe el bloque ${datos.bloque.toUpperCase()} en la sede ${datos.sede.toUpperCase()}.`,
        404,
      );
    }

    const tipo = await this.prisma.tipoEspacio.findUnique({
      where: { codigo: datos.tipo.toUpperCase() },
    });
    if (!tipo) {
      throw new ErrorDominio(
        'TIPO_ESPACIO_NO_ENCONTRADO',
        `No existe el tipo de espacio ${datos.tipo.toUpperCase()}.`,
        404,
      );
    }

    if (datos.piso > bloque.numeroPisos) {
      throw new ErrorDominio(
        'PISO_INVALIDO',
        `El bloque ${bloque.codigo} tiene ${bloque.numeroPisos} piso(s); el piso ${datos.piso} no existe.`,
        422,
      );
    }

    let dependenciaId: string | undefined;
    if (datos.dependencia) {
      const dependencia = await this.prisma.dependencia.findUnique({
        where: { codigo: datos.dependencia.toUpperCase() },
      });
      if (!dependencia) {
        throw new ErrorDominio(
          'DEPENDENCIA_NO_ENCONTRADA',
          `No existe la dependencia ${datos.dependencia.toUpperCase()}.`,
          404,
        );
      }
      dependenciaId = dependencia.id;
    }

    const repetido = await this.prisma.espacio.findUnique({
      where: { codigo: datos.codigo },
      select: { id: true },
    });
    if (repetido) {
      throw new ErrorDominio(
        'ESPACIO_DUPLICADO',
        `Ya existe un espacio con el código ${datos.codigo}.`,
        409,
      );
    }

    const espacio = await this.prisma.espacio.create({
      data: {
        bloqueId: bloque.id,
        tipoEspacioId: tipo.id,
        dependenciaId,
        codigo: datos.codigo,
        nombre: datos.nombre,
        piso: datos.piso,
        capacidadPersonas: datos.capacidadPersonas,
        areaM2: datos.areaM2,
        descripcion: datos.descripcion,
        condicionesUso: datos.condicionesUso,
        requiereAval: datos.requiereAval,
        esReservable: datos.esReservable,
        minutosMontaje: datos.minutosMontaje,
        minutosDesmontaje: datos.minutosDesmontaje,
        depositoValorFijo: datos.depositoValorFijo,
        depositoPorcentaje: datos.depositoPorcentaje,
      },
    });

    return {
      codigo: espacio.codigo,
      nombre: espacio.nombre,
      piso: espacio.piso,
      capacidadPersonas: espacio.capacidadPersonas,
      tipo: { codigo: tipo.codigo, nombre: tipo.nombre },
      bloque: { codigo: bloque.codigo, nombre: bloque.nombre },
      sede: { codigo: bloque.sede.codigo, nombre: bloque.sede.nombre },
    };
  }

  /** Modifica los datos del espacio. El código y el bloque no cambian. */
  async actualizar(
    codigo: string,
    datos: ActualizarEspacioDto,
  ): Promise<EspacioCreadoDto> {
    const actual = await this.prisma.espacio.findFirst({
      where: { codigo: codigo.toUpperCase(), archivadoEn: null },
      include: { bloque: { include: { sede: true } }, tipo: true },
    });
    if (!actual) throw noEncontrado('El espacio');

    let tipo = actual.tipo;
    if (datos.tipo !== undefined) {
      const nuevo = await this.prisma.tipoEspacio.findUnique({
        where: { codigo: datos.tipo.toUpperCase() },
      });
      if (!nuevo) {
        throw new ErrorDominio(
          'TIPO_ESPACIO_NO_ENCONTRADO',
          `No existe el tipo de espacio ${datos.tipo.toUpperCase()}.`,
          404,
        );
      }
      tipo = nuevo;
    }

    const piso = datos.piso ?? actual.piso;
    if (piso > actual.bloque.numeroPisos) {
      throw new ErrorDominio(
        'PISO_INVALIDO',
        `El bloque ${actual.bloque.codigo} tiene ${actual.bloque.numeroPisos} piso(s); el piso ${piso} no existe.`,
        422,
      );
    }

    let dependenciaId: string | null | undefined;
    if (datos.dependencia !== undefined) {
      if (datos.dependencia === null) {
        dependenciaId = null;
      } else {
        const dependencia = await this.prisma.dependencia.findUnique({
          where: { codigo: datos.dependencia.toUpperCase() },
        });
        if (!dependencia) {
          throw new ErrorDominio(
            'DEPENDENCIA_NO_ENCONTRADA',
            `No existe la dependencia ${datos.dependencia.toUpperCase()}.`,
            404,
          );
        }
        dependenciaId = dependencia.id;
      }
    }

    if (datos.responsableId) {
      const responsable = await this.prisma.usuario.findFirst({
        where: { id: datos.responsableId, activo: true },
        select: { id: true },
      });
      if (!responsable) {
        throw new ErrorDominio(
          'RESPONSABLE_NO_VALIDO',
          'El responsable indicado no existe o está inactivo.',
          422,
        );
      }
    }

    const espacio = await this.prisma.espacio.update({
      where: { id: actual.id },
      data: {
        ...(datos.tipo !== undefined ? { tipoEspacioId: tipo.id } : {}),
        ...(dependenciaId !== undefined ? { dependenciaId } : {}),
        ...(datos.responsableId !== undefined
          ? { responsableId: datos.responsableId }
          : {}),
        ...(datos.nombre !== undefined ? { nombre: datos.nombre.trim() } : {}),
        ...(datos.piso !== undefined ? { piso: datos.piso } : {}),
        ...(datos.capacidadPersonas !== undefined
          ? { capacidadPersonas: datos.capacidadPersonas }
          : {}),
        ...(datos.areaM2 !== undefined ? { areaM2: datos.areaM2 } : {}),
        ...(datos.descripcion !== undefined
          ? { descripcion: datos.descripcion }
          : {}),
        ...(datos.condicionesUso !== undefined
          ? { condicionesUso: datos.condicionesUso }
          : {}),
        ...(datos.estado !== undefined ? { estado: datos.estado } : {}),
        ...(datos.requiereAval !== undefined
          ? { requiereAval: datos.requiereAval }
          : {}),
        ...(datos.esReservable !== undefined
          ? { esReservable: datos.esReservable }
          : {}),
        ...(datos.minutosMontaje !== undefined
          ? { minutosMontaje: datos.minutosMontaje }
          : {}),
        ...(datos.minutosDesmontaje !== undefined
          ? { minutosDesmontaje: datos.minutosDesmontaje }
          : {}),
        ...(datos.depositoValorFijo !== undefined
          ? { depositoValorFijo: datos.depositoValorFijo }
          : {}),
        ...(datos.depositoPorcentaje !== undefined
          ? { depositoPorcentaje: datos.depositoPorcentaje }
          : {}),
      },
    });

    return {
      codigo: espacio.codigo,
      nombre: espacio.nombre,
      piso: espacio.piso,
      capacidadPersonas: espacio.capacidadPersonas,
      tipo: { codigo: tipo.codigo, nombre: tipo.nombre },
      bloque: { codigo: actual.bloque.codigo, nombre: actual.bloque.nombre },
      sede: {
        codigo: actual.bloque.sede.codigo,
        nombre: actual.bloque.sede.nombre,
      },
    };
  }

  /** Nada se borra: el espacio se archiva, salvo que tenga reservas futuras. */
  async archivar(codigo: string): Promise<void> {
    const espacio = await this.prisma.espacio.findFirst({
      where: { codigo: codigo.toUpperCase(), archivadoEn: null },
      select: { id: true, codigo: true },
    });
    if (!espacio) throw noEncontrado('El espacio');

    const reservasFuturas = await this.prisma.franjaOcupada.count({
      where: {
        espacioId: espacio.id,
        origen: 'RESERVA',
        estado: { in: ['RETENIDA', 'CONFIRMADA'] },
        fin: { gt: new Date() },
      },
    });
    if (reservasFuturas > 0) {
      throw new ErrorDominio(
        'ESPACIO_CON_RESERVAS',
        `El espacio ${espacio.codigo} tiene ${reservasFuturas} reserva(s) futura(s) y no se puede archivar.`,
        409,
        { reservasFuturas },
      );
    }

    await this.prisma.espacio.update({
      where: { id: espacio.id },
      data: { archivadoEn: new Date() },
    });
  }
}
