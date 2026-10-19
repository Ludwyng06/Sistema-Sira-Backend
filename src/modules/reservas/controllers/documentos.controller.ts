import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
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
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { TipoDocumentoAdjunto } from '../../../generated/prisma/enums.js';
import { UsuarioActual, type UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import { DocumentoDto, SubirDocumentoDto } from '../dto/documento.dto.js';
import {
  type ArchivoSubido,
  DocumentosService,
  TAMANO_MAXIMO_BYTES,
} from '../services/documentos.service.js';

@ApiTags('Solicitudes')
@ApiBearerAuth()
@Controller('solicitudes/:id/documentos')
export class DocumentosController {
  constructor(private readonly servicio: DocumentosService) {}

  @Post()
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: TAMANO_MAXIMO_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['archivo', 'tipo'],
      properties: {
        archivo: { type: 'string', format: 'binary', description: 'PDF, PNG o JPG de máximo 10 MB.' },
        tipo: { type: 'string', enum: Object.values(TipoDocumentoAdjunto) },
      },
    },
  })
  @ApiOperation({
    summary: 'Adjunta un documento al borrador.',
    description:
      'Solo el dueño y solo mientras es BORRADOR. Acepta PDF, PNG o JPG de hasta 10 MB; el tipo se valida por ' +
      'el contenido, no por el nombre. Máximo 15 documentos. La póliza es obligatoria para enviar cuando el ' +
      'aforo supera el umbral del tipo de espacio (RN-20).\n\n' +
      'Errores: 404 NO_ENCONTRADO; 409 SOLICITUD_NO_EDITABLE; 413 si supera 10 MB; ' +
      '422 ARCHIVO_REQUERIDO, ARCHIVO_NO_PERMITIDO, ARCHIVO_MUY_GRANDE o LIMITE_DE_ITEMS.',
  })
  @ApiCreatedResponse({ type: DocumentoDto })
  @ApiErrores(400, 401, 404, 409, 422)
  subir(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() datos: SubirDocumentoDto,
    @UploadedFile() archivo: ArchivoSubido | undefined,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<DocumentoDto> {
    return this.servicio.subir(id, datos.tipo, archivo, usuario);
  }

  @Get()
  @ApiOperation({
    summary: 'Lista los documentos de una solicitud.',
    description:
      'Visible para quien ve la solicitud (dueño, responsable, aprobador, tesorería, administración y ' +
      'auditoría). Fuera de alcance responde 404.\n\nErrores: 404 NO_ENCONTRADO.',
  })
  @ApiOkResponse({ type: [DocumentoDto] })
  @ApiErrores(400, 401, 404)
  listar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<DocumentoDto[]> {
    return this.servicio.listar(id, usuario);
  }

  @Get(':documentoId/archivo')
  @ApiProduces('application/pdf', 'image/png', 'image/jpeg')
  @ApiOperation({
    summary: 'Descarga el archivo de un documento.',
    description: 'Mismo alcance que el listado.\n\nErrores: 404 NO_ENCONTRADO.',
  })
  @ApiOkResponse({ description: 'Contenido del archivo.' })
  @ApiErrores(400, 401, 404)
  async descargar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('documentoId', new ParseUUIDPipe()) documentoId: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<StreamableFile> {
    const archivo = await this.servicio.descargar(id, documentoId, usuario);
    return new StreamableFile(archivo.contenido, {
      type: archivo.tipoMime,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(archivo.nombre)}`,
    });
  }

  @Delete(':documentoId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Quita un documento del borrador.',
    description: 'Errores: 404 NO_ENCONTRADO; 409 SOLICITUD_NO_EDITABLE.',
  })
  @ApiNoContentResponse({ description: 'Documento quitado.' })
  @ApiErrores(400, 401, 404, 409)
  eliminar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('documentoId', new ParseUUIDPipe()) documentoId: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    return this.servicio.eliminar(id, documentoId, usuario);
  }
}
