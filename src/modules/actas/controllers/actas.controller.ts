import {
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Roles, UsuarioActual, type UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import { ActaDto, CrearActaDto } from '../dto/acta.dto.js';
import { ActaPdfService } from '../services/acta-pdf.service.js';
import { ActasService } from '../services/actas.service.js';

@ApiTags('Actas')
@ApiBearerAuth()
@Controller('actas')
export class ActasController {
  constructor(
    private readonly servicio: ActasService,
    private readonly pdf: ActaPdfService,
  ) {}

  @Post()
  @Roles('RESPONSABLE_ESPACIO')
  @ApiOperation({
    summary: 'Registra el acta de entrega o de devolución (UC-05).',
    description:
      'Solo el responsable de un espacio de la solicitud. El checklist debe cubrir todos los elementos en ' +
      'servicio de sus espacios. Entrega: CONFIRMADA pasa a EN_USO. Devolución: EN_USO pasa a FINALIZADA, y ' +
      'exige una novedad por cada elemento incompleto o en mal estado. Una acta de cada tipo por solicitud.\n\n' +
      'Errores: 404 NO_ENCONTRADO; 409 ACTA_YA_REGISTRADA o ACTA_NO_PERMITIDA; ' +
      '422 CHECKLIST_INVALIDO o NOVEDAD_REQUERIDA.',
  })
  @ApiCreatedResponse({ type: ActaDto })
  @ApiErrores(400, 401, 403, 404, 409, 422)
  crear(
    @Body() datos: CrearActaDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('x-correlation-id') correlacionId: string | undefined,
  ): Promise<ActaDto> {
    return this.servicio.crear(datos, usuario, {
      ip,
      userAgent: userAgent ?? null,
      correlacionId: correlacionId ?? null,
    });
  }

  @Get(':id.pdf')
  @ApiProduces('application/pdf')
  @ApiOperation({
    summary: 'Descarga el acta en PDF tamaño carta.',
    description:
      'Con el checklist verificado, las novedades, las observaciones y los espacios para las firmas. ' +
      'Mismo alcance que el detalle del acta.\n\nErrores: 404 NO_ENCONTRADO.',
  })
  @ApiOkResponse({ description: 'Archivo PDF del acta.' })
  @ApiErrores(400, 401, 404)
  async descargarPdf(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<StreamableFile> {
    const archivo = await this.pdf.generar(id, usuario);
    return new StreamableFile(archivo.contenido, {
      type: 'application/pdf',
      disposition: `inline; filename="${archivo.nombre}"`,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalle de un acta.',
    description:
      'La ve el solicitante de la solicitud, el responsable del espacio, administración y auditoría; ' +
      'cualquier otro usuario recibe 404.\n\nErrores: 404 NO_ENCONTRADO.',
  })
  @ApiOkResponse({ type: ActaDto })
  @ApiErrores(400, 401, 404)
  obtener(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<ActaDto> {
    return this.servicio.obtener(id, usuario);
  }
}
