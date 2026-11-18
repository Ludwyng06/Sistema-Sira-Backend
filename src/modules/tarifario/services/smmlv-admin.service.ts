import { Injectable } from '@nestjs/common';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { MAXIMO_VALOR_PESOS, type GuardarSmmlvDto, type SmmlvDto } from '../dto/admin.dto.js';

@Injectable()
export class SmmlvAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(): Promise<SmmlvDto[]> {
    const filas = await this.prisma.smmlv.findMany({
      orderBy: { anio: 'desc' },
    });
    return filas.map((f) => ({ anio: f.anio, valor: f.valor }));
  }

  /**
   * RN-06, RF-TAR-06: registra o actualiza el SMMLV de un año y recalcula el valor en pesos
   * de las tarifas indexadas (`valorEnSmmlv !== null`) cuya vigencia inicie en ese año.
   */
  async guardar(anio: number, datos: GuardarSmmlvDto): Promise<SmmlvDto> {
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
      throw new ErrorDominio('ANIO_INVALIDO', 'El año debe estar entre 2000 y 2100.', 400);
    }

    const desdeAnio = new Date(`${anio}-01-01T00:00:00.000Z`);
    const hastaAnio = new Date(`${anio}-12-31T00:00:00.000Z`);

    return this.prisma.$transaction(async (tx) => {
      const registro = await tx.smmlv.upsert({
        where: { anio },
        create: { anio, valor: datos.valor },
        update: { valor: datos.valor },
      });

      const indexadas = await tx.tarifa.findMany({
        where: {
          valorEnSmmlv: { not: null },
          vigenciaDesde: { gte: desdeAnio, lte: hastaAnio },
        },
        select: { id: true, valorEnSmmlv: true },
      });

      for (const tarifa of indexadas) {
        const fraccion = Number(tarifa.valorEnSmmlv!.toString());
        const nuevoValor = Math.min(MAXIMO_VALOR_PESOS, Math.round(fraccion * datos.valor));
        await tx.tarifa.update({
          where: { id: tarifa.id },
          data: { valor: nuevoValor },
        });
      }

      return {
        anio: registro.anio,
        valor: registro.valor,
        tarifasRecalculadas: indexadas.length,
      };
    });
  }
}
