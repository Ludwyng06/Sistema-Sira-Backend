import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { TipoDocumentoAdjunto } from '../../../generated/prisma/enums.js';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ALMACENAMIENTO, type AlmacenamientoPort } from '../../../shared/almacenamiento/almacenamiento.port.js';
import { ErrorDominio, noEncontrado } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import {
  detectarTipoMime,
  EXTENSION_POR_TIPO,
  nombreSeguro,
  type TipoMimePermitido,
} from '../dominio/contenido-archivo.js';
import type { DocumentoDto } from '../dto/documento.dto.js';
import { bloquearBorrador, SolicitudesService } from './solicitudes.service.js';

export const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;
export const MAXIMO_DOCUMENTOS_POR_SOLICITUD = 15;

export interface ArchivoSubido {
  originalname: string;
  size: number;
  buffer: Buffer;
}

export interface ArchivoDescargable {
  contenido: Buffer;
  tipoMime: TipoMimePermitido;
  nombre: string;
}

function aDto(fila: {
  id: string;
  tipo: TipoDocumentoAdjunto;
  nombre: string;
  tamanoBytes: number;
  creadoEn: Date;
}): DocumentoDto {
  return {
    id: fila.id,
    tipo: fila.tipo,
    nombre: fila.nombre,
    tamanoBytes: fila.tamanoBytes,
    creadoEn: fila.creadoEn.toISOString(),
  };
}

@Injectable()
export class DocumentosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly solicitudes: SolicitudesService,
    @Inject(ALMACENAMIENTO) private readonly almacenamiento: AlmacenamientoPort,
  ) {}

  async subir(
    solicitudId: string,
    tipo: TipoDocumentoAdjunto,
    archivo: ArchivoSubido | undefined,
    usuario: UsuarioAutenticado,
  ): Promise<DocumentoDto> {
    await this.solicitudes.borradorPropio(solicitudId, usuario);
    if (!archivo || archivo.size === 0) {
      throw new ErrorDominio('ARCHIVO_REQUERIDO', 'Adjunta el archivo del documento.', 422);
    }
    if (archivo.size > TAMANO_MAXIMO_BYTES) {
      throw new ErrorDominio('ARCHIVO_MUY_GRANDE', 'El archivo no puede superar 10 MB.', 422);
    }
    const tipoMime = detectarTipoMime(archivo.buffer);
    if (!tipoMime) {
      throw new ErrorDominio('ARCHIVO_NO_PERMITIDO', 'Solo se aceptan archivos PDF, PNG o JPG.', 422);
    }
    const clave = `solicitudes/${solicitudId}/${randomUUID()}.${EXTENSION_POR_TIPO[tipoMime]}`;
    await this.almacenamiento.guardar(clave, archivo.buffer, tipoMime);
    try {
      const fila = await this.prisma.$transaction(async (tx) => {
        await bloquearBorrador(tx, solicitudId);
        const existentes = await tx.documentoAdjunto.count({ where: { solicitudId } });
        if (existentes >= MAXIMO_DOCUMENTOS_POR_SOLICITUD) {
          throw new ErrorDominio(
            'LIMITE_DE_ITEMS',
            `Una solicitud admite máximo ${MAXIMO_DOCUMENTOS_POR_SOLICITUD} documentos.`,
            422,
          );
        }
        return tx.documentoAdjunto.create({
          data: {
            solicitudId,
            tipo,
            nombre: nombreSeguro(archivo.originalname),
            url: clave,
            tamanoBytes: archivo.size,
          },
        });
      });
      return aDto(fila);
    } catch (error) {
      await this.almacenamiento.eliminar(clave);
      throw error;
    }
  }

  async listar(solicitudId: string, usuario: UsuarioAutenticado): Promise<DocumentoDto[]> {
    await this.solicitudes.asegurarVisible(solicitudId, usuario);
    const filas = await this.prisma.documentoAdjunto.findMany({
      where: { solicitudId },
      orderBy: { creadoEn: 'asc' },
    });
    return filas.map(aDto);
  }

  async descargar(
    solicitudId: string,
    documentoId: string,
    usuario: UsuarioAutenticado,
  ): Promise<ArchivoDescargable> {
    await this.solicitudes.asegurarVisible(solicitudId, usuario);
    const fila = await this.prisma.documentoAdjunto.findFirst({ where: { id: documentoId, solicitudId } });
    if (!fila) throw noEncontrado('El documento');
    const contenido = await this.almacenamiento.leer(fila.url);
    const tipoMime = contenido ? detectarTipoMime(contenido) : null;
    if (!contenido || !tipoMime) throw noEncontrado('El documento');
    return { contenido, tipoMime, nombre: fila.nombre };
  }

  async eliminar(solicitudId: string, documentoId: string, usuario: UsuarioAutenticado): Promise<void> {
    await this.solicitudes.borradorPropio(solicitudId, usuario);
    const url = await this.prisma.$transaction(async (tx) => {
      await bloquearBorrador(tx, solicitudId);
      const fila = await tx.documentoAdjunto.findFirst({
        where: { id: documentoId, solicitudId },
        select: { id: true, url: true },
      });
      if (!fila) throw noEncontrado('El documento');
      await tx.documentoAdjunto.delete({ where: { id: fila.id } });
      return fila.url;
    });
    await this.almacenamiento.eliminar(url);
  }
}
