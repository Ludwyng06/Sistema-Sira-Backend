import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import { Auditar } from '../../auditoria/auditar.decorador.js';
import { ActualizarEspacioDto } from '../dto/actualizar-espacio.dto.js';
import { CrearEspacioDto } from '../dto/crear-espacio.dto.js';
import { EspacioAdminDto, FiltrosEspaciosAdminDto, PaginaEspaciosAdminDto } from '../dto/espacio-admin.dto.js';
import { ReemplazarHorariosDto } from '../dto/horarios-espacio.dto.js';
import { EspacioCreadoDto, HorarioDto } from '../dto/respuestas.js';
import { EspaciosAdminService } from '../services/espacios-admin.service.js';

@ApiTags('Inventario · administración')
@ApiBearerAuth()
@Roles('ADMINISTRADOR')
@Controller('espacios')
export class EspaciosAdminController {
  constructor(private readonly servicio: EspaciosAdminService) {}

  @Get('gestion')
  @Roles('ADMINISTRADOR', 'AUDITOR')
  @ApiOperation({
    summary: 'Lista los espacios para administración, incluidos los ocultos del catálogo público.',
    description: 'Filtra por sede, bloque, estado y archivo; no excluye espacios por visibilidad pública.',
  })
  @ApiOkResponse({ type: PaginaEspaciosAdminDto })
  @ApiErrores(400, 401, 403)
  listar(@Query() filtros: FiltrosEspaciosAdminDto): Promise<PaginaEspaciosAdminDto> {
    return this.servicio.listar(filtros);
  }

  @Get('gestion/:codigo')
  @Roles('ADMINISTRADOR', 'AUDITOR')
  @ApiOperation({
    summary: 'Detalle administrativo de un espacio, aunque esté archivado o fuera de servicio.',
    description: 'El código se normaliza a mayúsculas. Errores: 404 NO_ENCONTRADO.',
  })
  @ApiOkResponse({ type: EspacioAdminDto })
  @ApiErrores(401, 403, 404)
  obtener(@Param('codigo') codigo: string): Promise<EspacioAdminDto> {
    return this.servicio.obtener(codigo);
  }

  @Post()
  @ApiOperation({ summary: 'Crea un espacio.', description: 'Permite asignar un responsable activo. Errores: 422 RESPONSABLE_NO_VALIDO o AVAL_SIN_RESPONSABLE (exigir aval requiere responsable).' })
  @ApiErrores(400, 401, 403, 422)
  @ApiCreatedResponse({ type: EspacioCreadoDto })
  @ApiConflictResponse({ description: 'Ya existe un espacio con ese código.' })
  crear(@Body() datos: CrearEspacioDto): Promise<EspacioCreadoDto> {
    return this.servicio.crear(datos);
  }

  @Patch(':codigo')
  @Auditar('ESPACIO_ACTUALIZADO', 'Espacio')
  @ApiOperation({
    summary: 'Modifica un espacio.',
    description:
      'El código y el bloque no cambian.\n\n' +
      'Errores: 404 NO_ENCONTRADO, TIPO_ESPACIO_NO_ENCONTRADO o DEPENDENCIA_NO_ENCONTRADA; ' +
      '422 PISO_INVALIDO, RESPONSABLE_NO_VALIDO o AVAL_SIN_RESPONSABLE (no se exige aval sin responsable ni se quita el responsable de un espacio con aval).',
  })
  @ApiOkResponse({ type: EspacioCreadoDto })
  @ApiNotFoundResponse({
    description: 'No existe el espacio, el tipo o la dependencia.',
  })
  actualizar(
    @Param('codigo') codigo: string,
    @Body() datos: ActualizarEspacioDto,
  ): Promise<EspacioCreadoDto> {
    return this.servicio.actualizar(codigo, datos);
  }

  @Put(':codigo/horarios')
  @Auditar('ESPACIO_HORARIOS_REEMPLAZADOS', 'Espacio')
  @ApiOperation({
    summary: 'Reemplaza el horario de operación de un espacio.',
    description:
      'Un día que no aparezca queda cerrado; una lista vacía quita la restricción (RN-19). ' +
      'No modifica las reservas ya hechas.\n\n' +
      'Errores: 404 NO_ENCONTRADO; 422 DIA_REPETIDO o HORARIO_INVALIDO.',
  })
  @ApiOkResponse({ type: [HorarioDto] })
  @ApiNotFoundResponse({ description: 'No existe el espacio.' })
  reemplazarHorarios(
    @Param('codigo') codigo: string,
    @Body() datos: ReemplazarHorariosDto,
  ): Promise<HorarioDto[]> {
    return this.servicio.reemplazarHorarios(codigo, datos);
  }

  @Patch(':codigo/archivar')
  @Auditar('ESPACIO_ARCHIVADO', 'Espacio')
  @HttpCode(204)
  @ApiOperation({ summary: 'Archiva un espacio (nunca se borra).' })
  @ApiNoContentResponse({ description: 'Espacio archivado.' })
  @ApiConflictResponse({ description: 'El espacio tiene reservas futuras.' })
  archivar(@Param('codigo') codigo: string): Promise<void> {
    return this.servicio.archivar(codigo);
  }

  @Patch(':codigo/restaurar')
  @Auditar('ESPACIO_RESTAURADO', 'Espacio')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Restaura un espacio archivado (RF-INV-03).',
    description: 'Es idempotente. Errores: 404 NO_ENCONTRADO; 422 SEDE_ARCHIVADA o BLOQUE_ARCHIVADO.',
  })
  @ApiNoContentResponse({ description: 'Espacio restaurado.' })
  @ApiErrores(401, 403, 404, 422)
  restaurar(@Param('codigo') codigo: string): Promise<void> {
    return this.servicio.restaurar(codigo);
  }
}
