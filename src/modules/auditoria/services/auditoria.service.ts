import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { FiltrosAuditoriaDto, PaginaAuditoriaDto } from '../dto/auditoria.dto.js';

@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Consulta de la bitácora inmutable (RF-AUD-01), de la más reciente a la más antigua. */
  async listar(filtros: FiltrosAuditoriaDto): Promise<PaginaAuditoriaDto> {
    const desde = filtros.desde ? new Date(filtros.desde) : undefined;
    const hasta = filtros.hasta ? new Date(filtros.hasta) : undefined;
    if (desde && hasta && hasta <= desde) {
      throw new ErrorDominio('RANGO_INVALIDO', 'La fecha final debe ser posterior a la inicial.', 400);
    }

    const where: Prisma.BitacoraWhereInput = {
      ...(filtros.entidad ? { entidad: filtros.entidad } : {}),
      ...(filtros.entidadId ? { entidadId: filtros.entidadId } : {}),
      ...(filtros.accion ? { accion: filtros.accion } : {}),
      ...(filtros.usuarioId ? { usuarioId: filtros.usuarioId } : {}),
      ...(desde || hasta ? { ocurrioEn: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } } : {}),
    };

    const [total, filas] = await Promise.all([
      this.prisma.bitacora.count({ where }),
      this.prisma.bitacora.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (filtros.pagina - 1) * filtros.porPagina,
        take: filtros.porPagina,
      }),
    ]);

    const ids = [...new Set(filas.map((f) => f.usuarioId).filter((v): v is string => v !== null))];
    const usuarios = ids.length
      ? await this.prisma.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, correo: true } })
      : [];
    const correos = new Map(usuarios.map((u) => [u.id, u.correo]));

    return {
      datos: filas.map((f) => ({
        id: f.id.toString(),
        usuarioId: f.usuarioId,
        usuarioCorreo: f.usuarioId ? (correos.get(f.usuarioId) ?? null) : null,
        accion: f.accion,
        entidad: f.entidad,
        entidadId: f.entidadId,
        datosAntes: f.datosAntes,
        datosDespues: f.datosDespues,
        ip: f.ip,
        userAgent: f.userAgent,
        correlacionId: f.correlacionId,
        ocurrioEn: f.ocurrioEn.toISOString(),
      })),
      total,
      pagina: filtros.pagina,
      porPagina: filtros.porPagina,
    };
  }
}
