import { Injectable } from '@nestjs/common';
import { ErrorDominio, noEncontrado } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { fechaLocal } from '../../../shared/tiempo/zona-horaria.js';
import type { CrearFestivoDto, FestivoDto } from '../dto/admin.dto.js';

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function aDto(fila: { fecha: Date; nombre: string }): FestivoDto {
  const fecha = fila.fecha.toISOString().slice(0, 10);
  return { id: fecha, fecha, nombre: fila.nombre };
}

function aFecha(iso: string): Date | null {
  if (!FORMATO_FECHA.test(iso)) return null;
  const fecha = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== iso ? null : fecha;
}

@Injectable()
export class FestivosAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(anio?: number): Promise<FestivoDto[]> {
    const anioConsulta = anio ?? Number(fechaLocal(new Date()).slice(0, 4));
    const filas = await this.prisma.festivo.findMany({
      where: {
        fecha: {
          gte: new Date(`${anioConsulta}-01-01T00:00:00.000Z`),
          lte: new Date(`${anioConsulta}-12-31T00:00:00.000Z`),
        },
      },
      orderBy: { fecha: 'asc' },
    });
    return filas.map(aDto);
  }

  async crear(datos: CrearFestivoDto): Promise<FestivoDto> {
    const fecha = aFecha(datos.fecha);
    if (!fecha) {
      throw new ErrorDominio('FECHA_INVALIDA', `La fecha ${datos.fecha} no es válida.`, 400);
    }
    const existente = await this.prisma.festivo.findUnique({ where: { fecha }, select: { fecha: true } });
    if (existente) {
      throw new ErrorDominio('FESTIVO_EXISTENTE', 'Ya hay un festivo registrado en esa fecha.', 409);
    }
    const creado = await this.prisma.festivo.create({ data: { fecha, nombre: datos.nombre.trim() } });
    return aDto(creado);
  }

  /**
   * Único borrado físico del tarifario: un festivo es un dato de calendario sin histórico propio; las
   * cotizaciones ya emitidas guardan su desglose congelado (RN-05) y no dependen de este registro.
   */
  async eliminar(id: string): Promise<void> {
    const fecha = aFecha(id);
    if (!fecha) throw noEncontrado('El festivo');
    const { count } = await this.prisma.festivo.deleteMany({ where: { fecha } });
    if (count === 0) throw noEncontrado('El festivo');
  }
}
