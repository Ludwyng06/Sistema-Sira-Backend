import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Publico } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import { FiltrosServiciosDto, ServicioDto } from '../dto/servicios.dto.js';
import { ServiciosService } from '../services/servicios.service.js';

@ApiTags('Servicios')
@Publico()
@Controller('servicios')
export class ServiciosController {
  constructor(private readonly servicio: ServiciosService) {}

  @Get()
  @ApiOperation({
    summary: 'Catálogo de servicios complementarios.',
    description:
      'Servicios activos con proveedor activo. Con tipoEspacioId lista los permitidos en ese tipo de ' +
      'espacio o los que no tienen restricción. No expone datos del proveedor.\n\n' +
      'Errores: 400 si tipoEspacioId no es un identificador válido.',
  })
  @ApiOkResponse({ type: [ServicioDto] })
  @ApiErrores(400, 429)
  listar(@Query() filtros: FiltrosServiciosDto): Promise<ServicioDto[]> {
    return this.servicio.listar(filtros.tipoEspacioId);
  }
}
