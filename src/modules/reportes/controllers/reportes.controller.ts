import { Controller, Get, Param, ParseEnumPipe, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Roles, UsuarioActual, type UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import { ConsultaTableroDto, TableroDto } from '../dto/tablero.dto.js';
import { ExportacionService, TIPOS_REPORTE, type TipoReporte } from '../services/exportacion.service.js';
import { TableroService } from '../services/tablero.service.js';

@ApiTags('Reportes')
@ApiBearerAuth()
@Controller('reportes')
export class ReportesController {
  constructor(
    private readonly servicio: TableroService,
    private readonly exportacion: ExportacionService,
  ) {}

  @Get('tablero')
  @Roles('ADMINISTRADOR', 'APROBADOR', 'TESORERIA', 'AUDITOR')
  @ApiOperation({
    summary: 'Indicadores del periodo (RF-REP-01).',
    description:
      'Solicitudes por estado, horas de ocupación y espacios más usados, recaudo aprobado, tiempo medio de ' +
      'aprobación y uso interno no cobrado. Solo lee. El aprobador ve únicamente las dependencias de su ' +
      'alcance. El periodo máximo es de 366 días; por defecto, los últimos 30.\n\n' +
      'Errores: 400 RANGO_INVALIDO.',
  })
  @ApiOkResponse({ type: TableroDto })
  @ApiErrores(400, 401, 403)
  tablero(@Query() consulta: ConsultaTableroDto, @UsuarioActual() usuario: UsuarioAutenticado): Promise<TableroDto> {
    return this.servicio.obtener(consulta, usuario);
  }

  @Get(':tipo.xlsx')
  @Roles('ADMINISTRADOR', 'APROBADOR', 'TESORERIA', 'AUDITOR')
  @ApiParam({ name: 'tipo', enum: TIPOS_REPORTE })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiOperation({
    summary: 'Exporta un reporte a Excel (XLSX).',
    description:
      'Tipos: solicitudes, recaudo y ocupacion. Acepta desde y hasta como el tablero (por defecto 30 días, ' +
      'máximo 366) y entrega hasta 10 000 filas. El aprobador solo exporta lo de su alcance y no el recaudo. ' +
      'Nunca incluye documento, teléfono ni correo del solicitante.\n\n' +
      'Errores: 400 RANGO_INVALIDO o tipo desconocido; 403 SIN_PERMISO para el recaudo.',
  })
  @ApiOkResponse({ description: 'Archivo XLSX del reporte.' })
  @ApiErrores(400, 401, 403)
  async xlsx(
    @Param('tipo', new ParseEnumPipe(TIPOS_REPORTE)) tipo: TipoReporte,
    @Query() consulta: ConsultaTableroDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<StreamableFile> {
    return this.entregar(tipo, 'xlsx', consulta, usuario);
  }

  @Get(':tipo.csv')
  @Roles('ADMINISTRADOR', 'APROBADOR', 'TESORERIA', 'AUDITOR')
  @ApiParam({ name: 'tipo', enum: TIPOS_REPORTE })
  @ApiProduces('text/csv')
  @ApiOperation({
    summary: 'Exporta un reporte a CSV.',
    description:
      'Mismo contenido y reglas que la exportación a Excel, en CSV UTF-8 con BOM (se abre bien en Excel).\n\n' +
      'Errores: 400 RANGO_INVALIDO o tipo desconocido; 403 SIN_PERMISO para el recaudo.',
  })
  @ApiOkResponse({ description: 'Archivo CSV del reporte.' })
  @ApiErrores(400, 401, 403)
  async csv(
    @Param('tipo', new ParseEnumPipe(TIPOS_REPORTE)) tipo: TipoReporte,
    @Query() consulta: ConsultaTableroDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<StreamableFile> {
    return this.entregar(tipo, 'csv', consulta, usuario);
  }

  private async entregar(
    tipo: TipoReporte,
    formato: 'xlsx' | 'csv',
    consulta: ConsultaTableroDto,
    usuario: UsuarioAutenticado,
  ): Promise<StreamableFile> {
    const archivo = await this.exportacion.generar(tipo, formato, consulta, usuario);
    return new StreamableFile(archivo.contenido, {
      type: archivo.tipoMime,
      disposition: `attachment; filename="${archivo.nombre}"`,
    });
  }
}
