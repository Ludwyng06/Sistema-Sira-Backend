import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import { Auditar } from '../../auditoria/auditar.decorador.js';
import {
  ActualizarTarifaDto,
  CrearTarifaDto,
  FiltrosTarifasDto,
  PaginaTarifasDto,
  TarifaDto,
} from '../dto/admin.dto.js';
import { TarifasAdminService } from '../services/tarifas-admin.service.js';

@ApiTags('Tarifas (administración)')
@ApiBearerAuth()
@Roles('ADMINISTRADOR')
@Controller('tarifas')
export class TarifasAdminController {
  constructor(private readonly servicio: TarifasAdminService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista las tarifas de espacios y servicios.',
    description:
      'Paginada, de la vigencia más reciente a la más antigua. Filtra por espacio, servicio, tipo de ' +
      'solicitante y por las vigentes hoy.',
  })
  @ApiOkResponse({ type: PaginaTarifasDto })
  @ApiErrores(400, 401, 403)
  listar(@Query() filtros: FiltrosTarifasDto): Promise<PaginaTarifasDto> {
    return this.servicio.listar(filtros);
  }

  @Post()
  @Auditar('TARIFA_CREADA', 'Tarifa')
  @ApiOperation({
    summary: 'Crea una tarifa con su vigencia.',
    description:
      'Exactamente uno de espacioId o servicioId, y exactamente uno de valor (pesos) o valorEnSmmlv. ' +
      'Los espacios exigen unidad de cobro. Una tarifa nueva cierra la vigente de la misma combinación el ' +
      'día anterior a su inicio; el valor nunca se edita (RN-05).\n\n' +
      'Errores: 404 NO_ENCONTRADO; 409 TARIFA_SOLAPADA; 422 TARIFA_INVALIDA o SMMLV_NO_DEFINIDO.',
  })
  @ApiCreatedResponse({ type: TarifaDto })
  @ApiErrores(400, 401, 403, 404, 409, 422)
  crear(@Body() datos: CrearTarifaDto): Promise<TarifaDto> {
    return this.servicio.crear(datos);
  }

  @Patch(':id')
  @Auditar('TARIFA_ACTUALIZADA', 'Tarifa')
  @ApiOperation({
    summary: 'Cierra la vigencia o edita el acuerdo de soporte de una tarifa.',
    description:
      'No permite cambiar el valor ni extender la vigencia: para eso se crea una tarifa nueva.\n\n' +
      'Errores: 404 NO_ENCONTRADO; 422 SIN_CAMBIOS o TARIFA_INVALIDA.',
  })
  @ApiOkResponse({ type: TarifaDto })
  @ApiErrores(400, 401, 403, 404, 422)
  actualizar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() datos: ActualizarTarifaDto,
  ): Promise<TarifaDto> {
    return this.servicio.actualizar(id, datos);
  }
}
