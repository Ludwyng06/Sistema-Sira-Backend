import { Injectable } from '@nestjs/common';
import { TipoRecargo } from '../../../generated/prisma/enums.js';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { ActualizarRecargoDto, RecargoDto } from '../dto/admin.dto.js';

const HORA_NOCTURNA_POR_DEFECTO = '18:00';

function aDto(fila: {
  id: string;
  tipo: TipoRecargo;
  porcentaje: { toString(): string };
  desdeHora: string | null;
  activo: boolean;
}): RecargoDto {
  return {
    id: fila.id,
    tipo: fila.tipo,
    porcentaje: Number(fila.porcentaje.toString()),
    desdeHora: fila.desdeHora,
    activo: fila.activo,
  };
}

@Injectable()
export class RecargosAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(): Promise<RecargoDto[]> {
    const filas = await this.prisma.recargo.findMany({ orderBy: { tipo: 'asc' } });
    return filas.map(aDto);
  }

  /** Los tipos son fijos (NOCTURNO, DOMINICAL, FESTIVO): se edita su configuración, no se crean otros. */
  async actualizar(tipo: TipoRecargo, datos: ActualizarRecargoDto): Promise<RecargoDto> {
    if (datos.porcentaje === undefined && datos.desdeHora === undefined && datos.activo === undefined) {
      throw new ErrorDominio('SIN_CAMBIOS', 'Indica porcentaje, desdeHora o activo para actualizar.', 422);
    }
    if (datos.desdeHora !== undefined && tipo !== TipoRecargo.NOCTURNO) {
      throw new ErrorDominio('RECARGO_INVALIDO', 'La hora de inicio solo aplica al recargo nocturno.', 422);
    }

    const existente = await this.prisma.recargo.findUnique({ where: { tipo } });
    if (!existente) {
      if (datos.porcentaje === undefined) {
        throw new ErrorDominio(
          'RECARGO_INVALIDO',
          'Este recargo aún no está configurado: indica el porcentaje para crearlo.',
          422,
        );
      }
      const creado = await this.prisma.recargo.create({
        data: {
          tipo,
          porcentaje: datos.porcentaje,
          desdeHora: tipo === TipoRecargo.NOCTURNO ? (datos.desdeHora ?? HORA_NOCTURNA_POR_DEFECTO) : null,
          activo: datos.activo ?? true,
        },
      });
      return aDto(creado);
    }

    const actualizado = await this.prisma.recargo.update({
      where: { tipo },
      data: {
        ...(datos.porcentaje !== undefined ? { porcentaje: datos.porcentaje } : {}),
        ...(datos.desdeHora !== undefined ? { desdeHora: datos.desdeHora } : {}),
        ...(datos.activo !== undefined ? { activo: datos.activo } : {}),
      },
    });
    return aDto(actualizado);
  }
}
