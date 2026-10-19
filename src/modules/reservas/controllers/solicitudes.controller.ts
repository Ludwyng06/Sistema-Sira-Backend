import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import {
  ActualizarSolicitudDto,
  CrearSolicitudDto,
  FiltrosSolicitudesDto,
  PaginaSolicitudesDto,
  SolicitudDetalleDto,
  SolicitudDto,
  SolicitudEnviadaDto,
} from '../dto/solicitud.dto.js';
import { CancelacionDto, CancelarSolicitudDto } from '../dto/cancelacion.dto.js';
import { DecidirSolicitudDto, DecisionRegistradaDto } from '../dto/decision.dto.js';
import { CancelacionService } from '../services/cancelacion.service.js';
import { CotizacionPdfService } from '../services/cotizacion-pdf.service.js';
import { DecisionesService } from '../services/decisiones.service.js';
import { EnvioService } from '../services/envio.service.js';
import { SolicitudesService } from '../services/solicitudes.service.js';

@ApiTags('Solicitudes')
@ApiBearerAuth()
@Controller('solicitudes')
export class SolicitudesController {
  constructor(
    private readonly servicio: SolicitudesService,
    private readonly envio: EnvioService,
    private readonly decisiones: DecisionesService,
    private readonly cancelacion: CancelacionService,
    private readonly cotizacionPdf: CotizacionPdfService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Crea una solicitud en borrador.',
    description:
      'El tipo de tarifa y la dependencia salen del perfil; la exención la decide el servidor al enviar. ' +
      'Solo las cuentas institucionales pueden declarar uso institucional.\n\n' +
      'Errores: 422 PERFIL_INCOMPLETO o USO_INSTITUCIONAL_NO_PERMITIDO.',
  })
  @ApiCreatedResponse({ type: SolicitudDto })
  @ApiErrores(400, 401, 422, 429)
  crear(@Body() datos: CrearSolicitudDto, @UsuarioActual() usuario: UsuarioAutenticado): Promise<SolicitudDto> {
    return this.servicio.crear(datos, usuario);
  }

  @Get()
  @ApiOperation({
    summary: 'Lista las solicitudes propias o la bandeja de revisión.',
    description:
      'Paginada, de la más reciente a la más antigua; filtra por estado. Con ambito=BANDEJA lista lo que ' +
      'debes revisar por tu rol.\n\n' +
      'Errores: 403 SIN_BANDEJA si tu rol no revisa solicitudes; 422 PERFIL_INCOMPLETO si pides las propias ' +
      'sin haber completado tu perfil de solicitante.',
  })
  @ApiOkResponse({ type: PaginaSolicitudesDto })
  @ApiErrores(400, 401, 403, 422)
  listar(
    @Query() filtros: FiltrosSolicitudesDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<PaginaSolicitudesDto> {
    return this.servicio.listar(filtros, usuario);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalle de una solicitud.',
    description:
      'Incluye reservas, servicios, decisiones y la última cotización. La ve su dueño; responsables, ' +
      'aprobadores, tesorería, administración y auditoría ven las de su alcance (nunca borradores ajenos). ' +
      'Una solicitud fuera de tu alcance responde 404.\n\n' +
      'Errores: 404 NO_ENCONTRADO.',
  })
  @ApiOkResponse({ type: SolicitudDetalleDto })
  @ApiErrores(400, 401, 404)
  obtener(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<SolicitudDetalleDto> {
    return this.servicio.obtener(id, usuario);
  }

  @Get(':id/cotizacion.pdf')
  @ApiProduces('application/pdf')
  @ApiOperation({
    summary: 'Descarga la cotización en PDF tamaño carta.',
    description:
      'Con la tarifa congelada al emitirla (RN-05), el desglose por espacio y servicio, el IVA, el depósito ' +
      'y el total; en solicitudes exentas, el valor de referencia. La ve quien ve la solicitud.\n\n' +
      'Errores: 404 NO_ENCONTRADO si la solicitud está fuera de tu alcance o aún no tiene cotización.',
  })
  @ApiOkResponse({ description: 'Archivo PDF de la cotización.' })
  @ApiErrores(400, 401, 404)
  async cotizacionPdfDe(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<StreamableFile> {
    const pdf = await this.cotizacionPdf.generar(id, usuario);
    return new StreamableFile(pdf.contenido, {
      type: 'application/pdf',
      disposition: `inline; filename="${pdf.nombre}"`,
    });
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Modifica los datos del evento de un borrador.',
    description:
      'Solo el dueño y solo mientras es BORRADOR.\n\n' +
      'Errores: 404 NO_ENCONTRADO; 409 SOLICITUD_NO_EDITABLE; 422 USO_INSTITUCIONAL_NO_PERMITIDO.',
  })
  @ApiOkResponse({ type: SolicitudDto })
  @ApiErrores(400, 401, 404, 409, 422)
  actualizar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() datos: ActualizarSolicitudDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<SolicitudDto> {
    return this.servicio.actualizar(id, datos, usuario);
  }

  @Post(':id/decisiones')
  @HttpCode(200)
  @Roles('RESPONSABLE_ESPACIO', 'APROBADOR')
  @ApiOperation({
    summary: 'Registra el aval o la aprobación de una solicitud (UC-02).',
    description:
      'El responsable del espacio da el AVAL; el aprobador de la dependencia dueña da la APROBACION, que ' +
      'emite la cotización (COTIZADA) o, si la solicitud es exenta, la confirma. RECHAZADA, DEVUELTA y ' +
      'RECLASIFICADA exigen motivo; rechazar o devolver libera las franjas. Una solicitud fuera de tu alcance ' +
      'responde 404.\n\n' +
      'Errores: 404 NO_ENCONTRADO; 409 SOLICITUD_NO_DECIDIBLE o DECISION_YA_REGISTRADA; ' +
      '422 MOTIVO_REQUERIDO, AVAL_PENDIENTE, AVAL_NO_REQUERIDO o RESULTADO_INVALIDO.',
  })
  @ApiOkResponse({ type: DecisionRegistradaDto })
  @ApiErrores(400, 401, 403, 404, 409, 422)
  decidir(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() datos: DecidirSolicitudDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('x-correlation-id') correlacionId: string | undefined,
  ): Promise<DecisionRegistradaDto> {
    return this.decisiones.decidir(id, datos, usuario, {
      ip,
      userAgent: userAgent ?? null,
      correlacionId: correlacionId ?? null,
    });
  }

  @Post(':id/enviar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Envía la solicitud a revisión (UC-01).',
    description:
      'Valida correo verificado, horario de operación, anticipación, aforo y póliza; evalúa la exención ' +
      '(el cliente nunca la envía); toma el consecutivo SOL- y retiene las franjas (con montaje y desmontaje) ' +
      'hasta el plazo de revisión. La solicitud queda EN_REVISION. Si el espacio es mucho más grande que el ' +
      'aforo, responde 200 con una advertencia no bloqueante y alternativas.\n\n' +
      'Errores: 404 NO_ENCONTRADO; 409 SOLICITUD_NO_EDITABLE o FRANJA_NO_DISPONIBLE (con los conflictos); ' +
      '422 CORREO_NO_VERIFICADO, SOLICITUD_SIN_RESERVAS o SOLICITUD_INCOMPLETA (con la lista de problemas).',
  })
  @ApiOkResponse({ type: SolicitudEnviadaDto })
  @ApiErrores(400, 401, 404, 409, 422, 429)
  enviar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('x-correlation-id') correlacionId: string | undefined,
  ): Promise<SolicitudEnviadaDto> {
    return this.envio.enviar(id, usuario, {
      ip,
      userAgent: userAgent ?? null,
      correlacionId: correlacionId ?? null,
    });
  }

  @Post(':id/cancelar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cancela una solicitud confirmada (RN-14).',
    description:
      'La cancela su dueño o la administración. Libera las franjas y calcula el reembolso según la política ' +
      'de cancelación y los días de antelación; si la cancela la institución, el reembolso es del 100 %. ' +
      'Solo se cancela una solicitud CONFIRMADA cuyo evento no ha empezado.\n\n' +
      'Errores: 404 NO_ENCONTRADO; 409 SOLICITUD_NO_CANCELABLE.',
  })
  @ApiOkResponse({ type: CancelacionDto })
  @ApiErrores(400, 401, 404, 409)
  cancelar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() datos: CancelarSolicitudDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('x-correlation-id') correlacionId: string | undefined,
  ): Promise<CancelacionDto> {
    return this.cancelacion.cancelar(id, datos, usuario, {
      ip,
      userAgent: userAgent ?? null,
      correlacionId: correlacionId ?? null,
    });
  }
}
