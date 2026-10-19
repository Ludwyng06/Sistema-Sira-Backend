import { Body, Controller, HttpCode, Param, Patch, Post } from '@nestjs/common';
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
import { Auditar } from '../../auditoria/auditar.decorador.js';
import { ActualizarEspacioDto } from '../dto/actualizar-espacio.dto.js';
import { CrearEspacioDto } from '../dto/crear-espacio.dto.js';
import { EspacioCreadoDto } from '../dto/respuestas.js';
import { EspaciosAdminService } from '../services/espacios-admin.service.js';

@ApiTags('Inventario · administración')
@ApiBearerAuth()
@Roles('ADMINISTRADOR')
@Controller('espacios')
export class EspaciosAdminController {
  constructor(private readonly servicio: EspaciosAdminService) {}

  @Post()
  @ApiOperation({ summary: 'Crea un espacio.' })
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
      '422 PISO_INVALIDO o RESPONSABLE_NO_VALIDO.',
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

  @Patch(':codigo/archivar')
  @HttpCode(204)
  @ApiOperation({ summary: 'Archiva un espacio (nunca se borra).' })
  @ApiNoContentResponse({ description: 'Espacio archivado.' })
  @ApiConflictResponse({ description: 'El espacio tiene reservas futuras.' })
  archivar(@Param('codigo') codigo: string): Promise<void> {
    return this.servicio.archivar(codigo);
  }
}
