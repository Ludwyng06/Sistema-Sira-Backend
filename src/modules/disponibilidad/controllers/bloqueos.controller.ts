import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles, UsuarioActual, type UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import { AnularBloqueoDto, BloqueoAnuladoDto } from '../dto/anular-bloqueo.dto.js';
import { CrearBloqueoDto } from '../dto/crear-bloqueo.dto.js';
import { ReporteImportacionDto, SubirHorarioDto } from '../dto/importacion.dto.js';
import { BloqueoCreadoDto } from '../dto/respuestas.js';
import { BloqueosService } from '../services/bloqueos.service.js';
import {
  ImportacionHorarioService,
  TAMANO_MAXIMO_CSV,
} from '../services/importacion-horario.service.js';

@ApiTags('Disponibilidad')
@ApiBearerAuth()
@Controller('bloqueos')
export class BloqueosController {
  constructor(
    private readonly servicio: BloqueosService,
    private readonly importacion: ImportacionHorarioService,
  ) {}

  @Post()
  @Roles('ADMINISTRADOR', 'RESPONSABLE_ESPACIO')
  @ApiOperation({
    summary: 'Bloquea un espacio, con repetición opcional.',
    description:
      'Crea un bloqueo y lo expande en franjas BLOQUEO. Con rrule (iCalendar) exige repetirHasta; máximo 366 ' +
      'ocurrencias de hasta 24 horas. El responsable solo bloquea espacios de su alcance; un espacio ajeno ' +
      'responde 404.\n\n' +
      'Errores: 400 BLOQUEO_INVALIDO; 404 NO_ENCONTRADO; 409 FRANJA_NO_DISPONIBLE (con los conflictos).',
  })
  @ApiCreatedResponse({ type: BloqueoCreadoDto })
  @ApiErrores(400, 401, 403, 404, 409, 429)
  crear(
    @Body() datos: CrearBloqueoDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('x-correlation-id') correlacionId: string | undefined,
  ): Promise<BloqueoCreadoDto> {
    return this.servicio.crear(datos, usuario, {
      ip,
      userAgent: userAgent ?? null,
      correlacionId: correlacionId ?? null,
    });
  }

  @Patch(':id/anular')
  @Roles('ADMINISTRADOR', 'RESPONSABLE_ESPACIO')
  @ApiOperation({
    summary: 'Anula un bloqueo y libera sus franjas futuras.',
    description:
      'Conserva el registro (nada se borra): marca la fecha de anulación y libera las franjas que aún no ' +
      'terminaron; las pasadas quedan como histórico. El responsable solo anula bloqueos de su alcance; uno ' +
      'ajeno responde 404.\n\nErrores: 404 NO_ENCONTRADO; 409 BLOQUEO_YA_ANULADO.',
  })
  @ApiOkResponse({ type: BloqueoAnuladoDto })
  @ApiErrores(400, 401, 403, 404, 409)
  anular(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() datos: AnularBloqueoDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('x-correlation-id') correlacionId: string | undefined,
  ): Promise<BloqueoAnuladoDto> {
    return this.servicio.anular(id, datos, usuario, {
      ip,
      userAgent: userAgent ?? null,
      correlacionId: correlacionId ?? null,
    });
  }

  @Post('importar-horario')
  @HttpCode(200)
  @Roles('ADMINISTRADOR')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: TAMANO_MAXIMO_CSV, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SubirHorarioDto })
  @ApiOperation({
    summary: 'Importa el horario académico desde un CSV (RN-03).',
    description:
      'Cada fila es una clase semanal: espacio (código), dia (LUN a DOM), horaInicio, horaFin (HH:MM, hora de ' +
      'Bogotá), desde y hasta (AAAA-MM-DD) y descripcion opcional. Crea bloqueos de clase. Lo que choca con una ' +
      'reserva o con otro bloqueo no se pisa: se omite y queda en el reporte de conflictos para reprogramar; ' +
      'las filas inválidas quedan en el reporte de errores.\n\n' +
      'Errores: 413 si supera 2 MB; 422 ARCHIVO_REQUERIDO, ARCHIVO_MUY_GRANDE o CSV_INVALIDO.',
  })
  @ApiOkResponse({ type: ReporteImportacionDto })
  @ApiErrores(400, 401, 403, 422)
  importarHorario(
    @UploadedFile() archivo: { buffer: Buffer } | undefined,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('x-correlation-id') correlacionId: string | undefined,
  ): Promise<ReporteImportacionDto> {
    return this.importacion.importar(archivo?.buffer, usuario, {
      ip,
      userAgent: userAgent ?? null,
      correlacionId: correlacionId ?? null,
    });
  }
}
