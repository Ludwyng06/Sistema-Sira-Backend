import { Body, Controller, Get, Headers, Ip, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles, UsuarioActual, type UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import { ActualizarParametroDto, ParametroDto } from '../dto/parametro-admin.dto.js';
import { ParametrosAdminService } from '../services/parametros-admin.service.js';

@ApiTags('Administración')
@ApiBearerAuth()
@Roles('ADMINISTRADOR')
@Controller('parametros')
export class ParametrosAdminController {
  constructor(private readonly servicio: ParametrosAdminService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista los parámetros del sistema.',
    description: 'Plazos, dominios institucionales, política de cancelación y cuenta de recaudo.',
  })
  @ApiOkResponse({ type: [ParametroDto] })
  @ApiErrores(401, 403)
  listar(): Promise<ParametroDto[]> {
    return this.servicio.listar();
  }

  @Patch(':clave')
  @ApiOperation({
    summary: 'Modifica el valor de un parámetro.',
    description:
      'El nuevo valor debe conservar la forma del actual (número, texto, lista de textos u objeto con las ' +
      'mismas claves). La política de cancelación y la cuenta de recaudo tienen validaciones propias. El valor ' +
      'anterior queda en la bitácora.\n\n' +
      'Errores: 404 NO_ENCONTRADO; 422 PARAMETRO_INVALIDO.',
  })
  @ApiOkResponse({ type: ParametroDto })
  @ApiErrores(400, 401, 403, 404, 422)
  actualizar(
    @Param('clave') clave: string,
    @Body() datos: ActualizarParametroDto,
    @UsuarioActual() actor: UsuarioAutenticado,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('x-correlation-id') correlacionId: string | undefined,
  ): Promise<ParametroDto> {
    return this.servicio.actualizar(clave, datos.valor, actor, {
      ip,
      userAgent: userAgent ?? null,
      correlacionId: correlacionId ?? null,
    });
  }
}
