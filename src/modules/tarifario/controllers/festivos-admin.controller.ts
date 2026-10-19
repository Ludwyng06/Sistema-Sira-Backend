import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import { Auditar } from '../../auditoria/auditar.decorador.js';
import { CrearFestivoDto, FestivoDto, FiltrosFestivosDto } from '../dto/admin.dto.js';
import { FestivosAdminService } from '../services/festivos-admin.service.js';

@ApiTags('Festivos (administración)')
@ApiBearerAuth()
@Roles('ADMINISTRADOR')
@Controller('festivos')
export class FestivosAdminController {
  constructor(private readonly servicio: FestivosAdminService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista los festivos de un año.',
    description: 'Por defecto, el año en curso. Los festivos alimentan el recargo festivo y los días hábiles.',
  })
  @ApiOkResponse({ type: [FestivoDto] })
  @ApiErrores(400, 401, 403)
  listar(@Query() filtros: FiltrosFestivosDto): Promise<FestivoDto[]> {
    return this.servicio.listar(filtros.anio);
  }

  @Post()
  @Auditar('FESTIVO_CREADO', 'Festivo')
  @ApiOperation({
    summary: 'Registra un festivo.',
    description: 'Errores: 400 FECHA_INVALIDA; 409 FESTIVO_EXISTENTE.',
  })
  @ApiCreatedResponse({ type: FestivoDto })
  @ApiErrores(400, 401, 403, 409)
  crear(@Body() datos: CrearFestivoDto): Promise<FestivoDto> {
    return this.servicio.crear(datos);
  }

  @Delete(':id')
  @HttpCode(204)
  @Auditar('FESTIVO_ELIMINADO', 'Festivo')
  @ApiOperation({
    summary: 'Elimina un festivo por su fecha (AAAA-MM-DD).',
    description:
      'Es el único borrado físico del tarifario: un festivo no tiene histórico propio y las cotizaciones ' +
      'emitidas guardan su desglose congelado. La eliminación queda en la bitácora.\n\n' +
      'Errores: 404 NO_ENCONTRADO.',
  })
  @ApiNoContentResponse({ description: 'Festivo eliminado.' })
  @ApiErrores(401, 403, 404)
  eliminar(@Param('id') id: string): Promise<void> {
    return this.servicio.eliminar(id);
  }
}
