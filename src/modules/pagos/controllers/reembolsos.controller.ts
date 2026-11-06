import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Roles, UsuarioActual, type UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import {
  FiltrosReembolsosDto,
  PaginaReembolsosDto,
  ReembolsoResueltoDto,
  ResolverReembolsoDto,
} from '../dto/pago.dto.js';
import { PagosService, type SoporteSubido, TAMANO_MAXIMO_SOPORTE } from '../services/pagos.service.js';

@ApiTags('Pagos · Reembolsos')
@ApiBearerAuth()
@Controller('pagos/reembolsos')
export class ReembolsosController {
  constructor(private readonly servicio: PagosService) {}

  @Get()
  @Roles('TESORERIA', 'AUDITOR', 'ADMINISTRADOR')
  @ApiOperation({
    summary: 'Lista los reembolsos solicitados, aplicados o rechazados (RF-PAG-10, RN-14).',
    description: 'Paginada, de la más reciente a la más antigua; filtra por estado.',
  })
  @ApiOkResponse({ type: PaginaReembolsosDto })
  @ApiErrores(400, 401, 403)
  listar(@Query() filtros: FiltrosReembolsosDto): Promise<PaginaReembolsosDto> {
    return this.servicio.listarReembolsos(filtros);
  }

  @Post(':id/resolucion')
  @HttpCode(200)
  @Roles('TESORERIA')
  @UseInterceptors(
    FileInterceptor('archivo', { limits: { fileSize: TAMANO_MAXIMO_SOPORTE, files: 1 } }),
  )
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({
    summary: 'Tesorería aplica (con soporte) o rechaza (con motivo) un reembolso (RF-PAG-10, RN-14).',
    description:
      'Al aplicar un reembolso con soporte (PDF, PNG o JPG de hasta 10 MB), la solicitud pasa de CANCELADA a ' +
      'REEMBOLSADA. Rechazar exige motivo.\n\n' +
      'Errores: 404 NO_ENCONTRADO; 409 REEMBOLSO_YA_RESUELTO; 422 MOTIVO_REQUERIDO, ARCHIVO_REQUERIDO o ARCHIVO_NO_PERMITIDO.',
  })
  @ApiOkResponse({ type: ReembolsoResueltoDto })
  @ApiErrores(400, 401, 403, 404, 409, 422)
  resolver(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() datos: ResolverReembolsoDto,
    @UploadedFile() archivo: SoporteSubido | undefined,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('x-correlation-id') correlacionId: string | undefined,
  ): Promise<ReembolsoResueltoDto> {
    return this.servicio.resolverReembolso(id, datos, archivo, usuario, {
      ip,
      userAgent: userAgent ?? null,
      correlacionId: correlacionId ?? null,
    });
  }

  @Get(':id/soporte')
  @ApiProduces('application/pdf', 'image/png', 'image/jpeg')
  @ApiOperation({
    summary: 'Descarga el comprobante del reembolso aplicado.',
    description:
      'Disponible para el solicitante dueño, tesorería, administración y auditoría.\n\nErrores: 404 NO_ENCONTRADO.',
  })
  @ApiOkResponse({ description: 'Contenido del soporte.' })
  @ApiErrores(400, 401, 404)
  async descargarSoporte(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<StreamableFile> {
    const archivo = await this.servicio.descargarSoporteReembolso(id, usuario);
    return new StreamableFile(archivo.contenido, {
      type: archivo.tipoMime,
      disposition: `attachment; filename="${archivo.nombre}"`,
    });
  }
}
