import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { fechaLocal } from '../../../shared/tiempo/zona-horaria.js';
import { evaluarAforo, ordenarPorAjuste } from '../../inventario/dominio/aforo.js';
import type { BuscarDisponibilidadDto } from '../dto/buscar-disponibilidad.dto.js';
import type { EspacioLibreDto, ResultadoBusquedaDto } from '../dto/respuestas.js';

/** Bogotá no tiene horario de verano: su desfase con UTC es fijo. */
const DESFASE_BOGOTA = '-05:00';

function rangoInvalido(mensaje: string): ErrorDominio {
  return new ErrorDominio('RANGO_INVALIDO', mensaje, 400);
}

function instante(fecha: string, hora: string): Date {
  const valor = new Date(`${fecha}T${hora}:00${DESFASE_BOGOTA}`);
  if (Number.isNaN(valor.getTime())) throw rangoInvalido('La fecha indicada no es válida.');
  return valor;
}

@Injectable()
export class BusquedaService {
  constructor(private readonly prisma: PrismaService) {}

  async buscar(consulta: BuscarDisponibilidadDto, ahora: Date = new Date()): Promise<ResultadoBusquedaDto> {
    const inicio = instante(consulta.fecha, consulta.horaInicio);
    const fin = instante(consulta.fecha, consulta.horaFin);
    if (fin <= inicio) throw rangoInvalido('La hora de fin debe ser posterior a la de inicio.');
    if (consulta.fecha < fechaLocal(ahora)) throw rangoInvalido('La fecha no puede estar en el pasado.');

    const where: Prisma.EspacioWhereInput = {
      archivadoEn: null,
      esReservable: true,
      estado: { not: 'FUERA_DE_SERVICIO' },
      capacidadPersonas: { gte: consulta.asistentes },
      bloque: { activo: true, sede: { activa: true, ...(consulta.sedeId ? { id: consulta.sedeId } : {}) } },
      franjas: { none: { estado: { not: 'LIBERADA' }, inicio: { lt: fin }, fin: { gt: inicio } } },
    };
    const libres = await this.prisma.espacio.findMany({
      where,
      select: {
        id: true,
        codigo: true,
        nombre: true,
        piso: true,
        capacidadPersonas: true,
        bloque: { select: { codigo: true, nombre: true, sede: { select: { codigo: true, nombre: true } } } },
      },
    });

    const espacios = ordenarPorAjuste(libres, consulta.asistentes).map((espacio): EspacioLibreDto => {
      const { nivel, ocupacion, mensaje } = evaluarAforo(espacio.capacidadPersonas, consulta.asistentes);
      return {
        espacioId: espacio.id,
        codigo: espacio.codigo,
        nombre: espacio.nombre,
        piso: espacio.piso,
        capacidadPersonas: espacio.capacidadPersonas,
        bloque: { codigo: espacio.bloque.codigo, nombre: espacio.bloque.nombre },
        sede: { codigo: espacio.bloque.sede.codigo, nombre: espacio.bloque.sede.nombre },
        aforo: { nivel: nivel === 'SOBRA_ESPACIO' ? 'SOBRA_ESPACIO' : 'ADECUADO', ocupacion, mensaje },
      };
    });

    return {
      fecha: consulta.fecha,
      horaInicio: consulta.horaInicio,
      horaFin: consulta.horaFin,
      asistentes: consulta.asistentes,
      espacios,
      total: espacios.length,
    };
  }
}
