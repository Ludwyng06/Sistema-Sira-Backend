import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Publico, Roles, UsuarioActual, type UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import { FotoDto, SubirFotoDto, VARIANTES_FOTO, type VarianteFoto } from '../dto/fotografia.dto.js';
import { type ArchivoFoto, FotografiasService, TAMANO_MAXIMO_FOTO } from '../services/fotografias.service.js';

@ApiTags('Inventario')
@ApiBearerAuth()
@Controller('espacios/:id/fotos')
export class FotosEspacioController {
  constructor(private readonly servicio: FotografiasService) {}

  @Post()
  @Roles('ADMINISTRADOR', 'RESPONSABLE_ESPACIO')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: TAMANO_MAXIMO_FOTO, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['archivo', 'textoAlternativo'],
      properties: {
        archivo: { type: 'string', format: 'binary', description: 'Imagen JPG o PNG de máximo 10 MB.' },
        textoAlternativo: { type: 'string', maxLength: 250, description: 'Texto alternativo obligatorio.' },
        esPortada: { type: 'boolean', default: false },
        orden: { type: 'integer', minimum: 0, maximum: 999 },
      },
    },
  })
  @ApiOperation({
    summary: 'Sube una foto del espacio.',
    description:
      'Imagen JPG o PNG de hasta 10 MB, validada por su contenido. Genera tres variantes WebP (detalle, ' +
      'tarjeta y miniatura) y exige texto alternativo. La primera foto queda como portada; las demás solo si ' +
      'se indica. Máximo 30 por espacio. Administración o el responsable del espacio; otro usuario recibe 404.\n\n' +
      'Errores: 404 NO_ENCONTRADO; 413 si supera 10 MB; 422 ARCHIVO_REQUERIDO, ARCHIVO_NO_PERMITIDO o ' +
      'LIMITE_DE_ITEMS.',
  })
  @ApiCreatedResponse({ type: FotoDto })
  @ApiErrores(400, 401, 403, 404, 422)
  subir(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() datos: SubirFotoDto,
    @UploadedFile() archivo: ArchivoFoto | undefined,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<FotoDto> {
    return this.servicio.subir(id, datos, archivo, usuario);
  }

  @Delete(':fotoId')
  @HttpCode(204)
  @Roles('ADMINISTRADOR', 'RESPONSABLE_ESPACIO')
  @ApiOperation({
    summary: 'Elimina una foto del espacio.',
    description:
      'Borra la foto y sus variantes; si era la portada, la siguiente por orden pasa a serlo. Es el único ' +
      'borrado físico del módulo.\n\nErrores: 404 NO_ENCONTRADO.',
  })
  @ApiNoContentResponse({ description: 'Foto eliminada.' })
  @ApiErrores(400, 401, 403, 404)
  eliminar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('fotoId', new ParseUUIDPipe()) fotoId: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    return this.servicio.eliminar(id, fotoId, usuario);
  }
}

@ApiTags('Inventario')
@Publico()
@Controller('fotos')
export class FotosPublicasController {
  constructor(private readonly servicio: FotografiasService) {}

  @Get(':id/:variante')
  @Header('Cache-Control', 'public, max-age=86400')
  @ApiParam({ name: 'variante', enum: VARIANTES_FOTO })
  @ApiProduces('image/webp')
  @ApiOperation({
    summary: 'Descarga una variante de una foto.',
    description:
      'Imagen WebP: detalle (1280 px), tarjeta (480 px) o miniatura (160 px de ancho máximo).\n\n' +
      'Errores: 404 NO_ENCONTRADO.',
  })
  @ApiOkResponse({ description: 'Imagen WebP.' })
  @ApiErrores(400, 404, 429)
  async servir(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('variante', new ParseEnumPipe(VARIANTES_FOTO)) variante: VarianteFoto,
  ): Promise<StreamableFile> {
    const foto = await this.servicio.servir(id, variante);
    return new StreamableFile(foto.contenido, { type: 'image/webp' });
  }
}
