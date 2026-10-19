import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { Rol } from '../../../generated/prisma/enums.js';
import { ALMACENAMIENTO, type AlmacenamientoPort } from '../../../shared/almacenamiento/almacenamiento.port.js';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ErrorDominio, noEncontrado } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { detectarTipoMime } from '../../reservas/dominio/contenido-archivo.js';
import { type FotoDto, VARIANTES_FOTO, type SubirFotoDto, type VarianteFoto } from '../dto/fotografia.dto.js';

export const TAMANO_MAXIMO_FOTO = 10 * 1024 * 1024;
export const MAXIMO_FOTOS_POR_ESPACIO = 30;
const MAXIMO_PIXELES = 40_000_000;

/** Ancho máximo de cada variante: nunca se agranda una imagen más pequeña. */
export const ANCHO_VARIANTE: Record<VarianteFoto, number> = {
  detalle: 1280,
  tarjeta: 480,
  miniatura: 160,
};

export interface ArchivoFoto {
  size: number;
  buffer: Buffer;
}

export interface FotoServida {
  contenido: Buffer;
}

function claveDe(espacioId: string, fotoId: string, variante: VarianteFoto): string {
  return `espacios/${espacioId}/${fotoId}-${variante}.webp`;
}

function urlDe(fotoId: string, variante: VarianteFoto): string {
  return `/api/fotos/${fotoId}/${variante}`;
}

@Injectable()
export class FotografiasService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ALMACENAMIENTO) private readonly almacenamiento: AlmacenamientoPort,
  ) {}

  /** RF-INV-04: foto con texto alternativo, en tres variantes WebP. Solo administración o su responsable. */
  async subir(
    espacioId: string,
    datos: SubirFotoDto,
    archivo: ArchivoFoto | undefined,
    usuario: UsuarioAutenticado,
  ): Promise<FotoDto> {
    const espacio = await this.espacioGestionable(espacioId, usuario);

    if (!archivo || archivo.size === 0) {
      throw new ErrorDominio('ARCHIVO_REQUERIDO', 'Adjunta la imagen.', 422);
    }
    if (archivo.size > TAMANO_MAXIMO_FOTO) {
      throw new ErrorDominio('ARCHIVO_MUY_GRANDE', 'La imagen no puede superar 10 MB.', 422);
    }
    const tipo = detectarTipoMime(archivo.buffer);
    if (tipo !== 'image/jpeg' && tipo !== 'image/png') {
      throw new ErrorDominio('ARCHIVO_NO_PERMITIDO', 'Solo se aceptan imágenes JPG o PNG.', 422);
    }
    const existentes = await this.prisma.fotografia.count({ where: { espacioId: espacio.id } });
    if (existentes >= MAXIMO_FOTOS_POR_ESPACIO) {
      throw new ErrorDominio(
        'LIMITE_DE_ITEMS',
        `Un espacio admite máximo ${MAXIMO_FOTOS_POR_ESPACIO} fotos.`,
        422,
      );
    }

    const variantes = await this.generarVariantes(archivo.buffer);
    const fotoId = randomUUID();
    const claves = VARIANTES_FOTO.map((v) => claveDe(espacio.id, fotoId, v));
    for (const [i, variante] of VARIANTES_FOTO.entries()) {
      await this.almacenamiento.guardar(claves[i]!, variantes[variante], 'image/webp');
    }

    try {
      const fila = await this.prisma.$transaction(async (tx) => {
        // Candado de fila: dos subidas simultáneas no superan el límite ni dejan dos portadas.
        await tx.$queryRaw`SELECT id FROM espacio WHERE id = ${espacio.id}::uuid FOR UPDATE`;
        const actuales = await tx.fotografia.count({ where: { espacioId: espacio.id } });
        if (actuales >= MAXIMO_FOTOS_POR_ESPACIO) {
          throw new ErrorDominio(
            'LIMITE_DE_ITEMS',
            `Un espacio admite máximo ${MAXIMO_FOTOS_POR_ESPACIO} fotos.`,
            422,
          );
        }
        const esPortada = datos.esPortada === true || actuales === 0;
        if (esPortada) {
          await tx.fotografia.updateMany({
            where: { espacioId: espacio.id, esPortada: true },
            data: { esPortada: false },
          });
        }
        return tx.fotografia.create({
          data: {
            id: fotoId,
            espacioId: espacio.id,
            urlDetalle: urlDe(fotoId, 'detalle'),
            urlTarjeta: urlDe(fotoId, 'tarjeta'),
            urlMiniatura: urlDe(fotoId, 'miniatura'),
            orden: datos.orden ?? actuales,
            esPortada,
            textoAlternativo: datos.textoAlternativo.trim(),
          },
        });
      });
      return this.aDto(fila);
    } catch (error) {
      await Promise.all(claves.map((c) => this.almacenamiento.eliminar(c)));
      throw error;
    }
  }

  /** Foto pública (los espacios visibles ya son públicos): se sirve desde el almacenamiento. */
  async servir(fotoId: string, variante: VarianteFoto): Promise<FotoServida> {
    const foto = await this.prisma.fotografia.findUnique({
      where: { id: fotoId },
      select: { espacioId: true },
    });
    if (!foto?.espacioId) throw noEncontrado('La foto');
    const contenido = await this.almacenamiento.leer(claveDe(foto.espacioId, fotoId, variante));
    if (!contenido) throw noEncontrado('La foto');
    return { contenido };
  }

  /** Único borrado físico del módulo: la tabla no tiene estado de archivo y la foto no es un registro fiscal. */
  async eliminar(espacioId: string, fotoId: string, usuario: UsuarioAutenticado): Promise<void> {
    const espacio = await this.espacioGestionable(espacioId, usuario);
    const foto = await this.prisma.fotografia.findFirst({
      where: { id: fotoId, espacioId: espacio.id },
      select: { id: true, esPortada: true },
    });
    if (!foto) throw noEncontrado('La foto');

    await this.prisma.$transaction(async (tx) => {
      await tx.fotografia.delete({ where: { id: foto.id } });
      if (foto.esPortada) {
        const siguiente = await tx.fotografia.findFirst({
          where: { espacioId: espacio.id },
          orderBy: { orden: 'asc' },
          select: { id: true },
        });
        if (siguiente) await tx.fotografia.update({ where: { id: siguiente.id }, data: { esPortada: true } });
      }
    });
    await Promise.all(
      VARIANTES_FOTO.map((v) => this.almacenamiento.eliminar(claveDe(espacio.id, foto.id, v))),
    );
  }

  private async espacioGestionable(espacioId: string, usuario: UsuarioAutenticado) {
    const espacio = await this.prisma.espacio.findFirst({
      where: { id: espacioId, archivadoEn: null },
      select: { id: true, responsableId: true },
    });
    const esAdministrador = usuario.roles.includes(Rol.ADMINISTRADOR);
    const esResponsable = usuario.roles.includes(Rol.RESPONSABLE_ESPACIO) && espacio?.responsableId === usuario.id;
    if (!espacio || (!esAdministrador && !esResponsable)) throw noEncontrado('El espacio');
    return espacio;
  }

  private async generarVariantes(original: Buffer): Promise<Record<VarianteFoto, Buffer>> {
    try {
      const base = sharp(original, { limitInputPixels: MAXIMO_PIXELES }).rotate();
      const [detalle, tarjeta, miniatura] = await Promise.all(
        VARIANTES_FOTO.map((v) =>
          base
            .clone()
            .resize({ width: ANCHO_VARIANTE[v], withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer(),
        ),
      );
      return { detalle: detalle!, tarjeta: tarjeta!, miniatura: miniatura! };
    } catch {
      throw new ErrorDominio(
        'ARCHIVO_NO_PERMITIDO',
        'No pudimos procesar la imagen. Verifica que no esté dañada y que no sea demasiado grande.',
        422,
      );
    }
  }

  private aDto(fila: {
    id: string;
    urlDetalle: string;
    urlTarjeta: string;
    urlMiniatura: string;
    textoAlternativo: string;
    esPortada: boolean;
    orden: number;
  }): FotoDto {
    return {
      id: fila.id,
      urlDetalle: fila.urlDetalle,
      urlTarjeta: fila.urlTarjeta,
      urlMiniatura: fila.urlMiniatura,
      textoAlternativo: fila.textoAlternativo,
      esPortada: fila.esPortada,
      orden: fila.orden,
    };
  }
}
