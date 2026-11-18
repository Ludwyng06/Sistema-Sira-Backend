import { Body, Controller, Get, Param, ParseEnumPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { TipoRecargo } from '../../../generated/prisma/enums.js';
import { Roles } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import { Auditar } from '../../auditoria/auditar.decorador.js';
import { ActualizarRecargoDto, RecargoDto } from '../dto/admin.dto.js';
import { RecargosAdminService } from '../services/recargos-admin.service.js';

@ApiTags('Recargos (administración)')
@ApiBearerAuth()
@Roles('ADMINISTRADOR')
@Controller('recargos')
export class RecargosAdminController {
  constructor(private readonly servicio: RecargosAdminService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista los recargos configurados.',
    description: 'Nocturno, dominical y festivo, con su porcentaje y si están activos.',
  })
  @ApiOkResponse({ type: [RecargoDto] })
  @ApiErrores(401, 403)
  listar(): Promise<RecargoDto[]> {
    return this.servicio.listar();
  }

  @Patch(':tipo')
  @Auditar('RECARGO_ACTUALIZADO', 'Recargo')
  @ApiOperation({
    summary: 'Actualiza el porcentaje, la hora de inicio o el estado de un recargo.',
    description:
      'Los tipos son fijos. La hora de inicio (HH:MM) solo aplica al recargo NOCTURNO. Si el recargo aún ' +
      'no está configurado, el porcentaje es obligatorio y se crea.\n\n' +
      'Errores: 400 si el tipo no es válido; 422 SIN_CAMBIOS o RECARGO_INVALIDO.',
  })
  @ApiParam({ name: 'tipo', enum: TipoRecargo })
  @ApiOkResponse({ type: RecargoDto })
  @ApiErrores(400, 401, 403, 422)
  actualizar(
    @Param('tipo', new ParseEnumPipe(TipoRecargo)) tipo: TipoRecargo,
    @Body() datos: ActualizarRecargoDto,
  ): Promise<RecargoDto> {
    return this.servicio.actualizar(tipo, datos);
  }
}
