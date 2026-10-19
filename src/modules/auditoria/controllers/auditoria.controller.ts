import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import { FiltrosAuditoriaDto, PaginaAuditoriaDto } from '../dto/auditoria.dto.js';
import { AuditoriaService } from '../services/auditoria.service.js';

@ApiTags('Auditoría')
@ApiBearerAuth()
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly servicio: AuditoriaService) {}

  @Get()
  @Roles('ADMINISTRADOR', 'AUDITOR')
  @ApiOperation({
    summary: 'Consulta la bitácora.',
    description:
      'Registros inmutables de las acciones sensibles, de la más reciente a la más antigua, filtrables por ' +
      'entidad, acción, usuario y rango de fechas. Solo administración y auditoría.\n\n' +
      'Errores: 400 RANGO_INVALIDO.',
  })
  @ApiOkResponse({ type: PaginaAuditoriaDto })
  @ApiErrores(400, 401, 403)
  listar(@Query() filtros: FiltrosAuditoriaDto): Promise<PaginaAuditoriaDto> {
    return this.servicio.listar(filtros);
  }
}
