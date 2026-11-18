import { Controller, Get, HttpCode, Post, Query, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Roles, UsuarioActual, type UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import { ConciliacionDto, ExtractoConciliacionDto, FechaConciliacionDto } from '../dto/conciliacion.dto.js';
import { MAXIMO_EXTRACTO } from '../dominio/conciliacion.js';
import { ConciliacionService } from '../services/conciliacion.service.js';

@ApiTags('Pagos') @ApiBearerAuth() @Roles('TESORERIA', 'ADMINISTRADOR') @Controller('pagos/conciliacion')
export class ConciliacionController {
  constructor(private readonly servicio: ConciliacionService) {}
  @Get() @ApiOkResponse({ type: ConciliacionDto })
  @ApiOperation({ summary: 'Consulta el informe diario de conciliación.', description: 'Fecha del día en America/Bogota y valores en pesos enteros. Incluye las diferencias de la última comparación registrada, si existe. Errores: 400 FECHA_INVALIDA.' })
  @ApiErrores(400, 401, 403)
  informe(@Query() datos: FechaConciliacionDto): Promise<ConciliacionDto> { return this.servicio.informe(datos.fecha); }
  @Post('extracto') @HttpCode(200) @UseInterceptors(FileInterceptor('archivo', { limits: { files: 1, fileSize: MAXIMO_EXTRACTO } }))
  @ApiConsumes('multipart/form-data') @ApiBody({ type: ExtractoConciliacionDto }) @ApiOkResponse({ type: ConciliacionDto })
  @ApiOperation({ summary: 'Compara un CSV de extracto con el día de conciliación.', description: 'Columnas referencia,valor,fecha; UTF-8 y máximo 2 MB. No conserva el archivo, solo resumen y huella en bitácora. Errores: 400 FECHA_INVALIDA; 422 CSV_INVALIDO o EXTRACTO_INVALIDO; 413 archivo demasiado grande.' })
  @ApiErrores(400, 401, 403, 422)
  extracto(@Query() datos: FechaConciliacionDto, @UploadedFile() archivo: { buffer: Buffer } | undefined,
    @UsuarioActual() usuario: UsuarioAutenticado): Promise<ConciliacionDto> {
    if (!archivo) throw new ErrorDominio('EXTRACTO_INVALIDO', 'Adjunta el archivo CSV.', 422);
    return this.servicio.informe(datos.fecha, archivo.buffer, usuario.id);
  }
  @Get('pdf') @ApiProduces('application/pdf') @ApiOkResponse({ description: 'Informe de conciliación en formato carta.' })
  @ApiOperation({ summary: 'Descarga el informe diario en PDF carta.', description: 'Solo tesorería y administración. Errores: 400 FECHA_INVALIDA.' })
  @ApiErrores(400, 401, 403)
  async pdf(@Query() datos: FechaConciliacionDto): Promise<StreamableFile> {
    return new StreamableFile(await this.servicio.pdf(datos.fecha), { type: 'application/pdf', disposition: `attachment; filename="conciliacion-${datos.fecha}.pdf"` });
  }
}
