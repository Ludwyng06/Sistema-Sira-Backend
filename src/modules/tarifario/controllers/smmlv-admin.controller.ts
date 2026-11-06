import { Body, Controller, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import { Auditar } from '../../auditoria/auditar.decorador.js';
import { GuardarSmmlvDto, SmmlvDto } from '../dto/admin.dto.js';
import { SmmlvAdminService } from '../services/smmlv-admin.service.js';

@ApiTags('SMMLV (administración)')
@ApiBearerAuth()
@Roles('ADMINISTRADOR')
@Controller('smmlv')
export class SmmlvAdminController {
  constructor(private readonly servicio: SmmlvAdminService) {}

  @Get()
  @Roles('ADMINISTRADOR', 'AUDITOR')
  @ApiOperation({
    summary: 'Lista los valores anuales del SMMLV configurados (RN-06, RF-TAR-06).',
    description: 'Ordenados del año más reciente al más antiguo.',
  })
  @ApiOkResponse({ type: [SmmlvDto] })
  @ApiErrores(401, 403)
  listar(): Promise<SmmlvDto[]> {
    return this.servicio.listar();
  }

  @Put(':anio')
  @Auditar('SMMLV_ACTUALIZADO', 'Smmlv')
  @ApiOperation({
    summary: 'Registra o actualiza el SMMLV de un año y recalcula las tarifas indexadas de ese año (RN-06, RF-TAR-06).',
    description: 'Crea o actualiza el valor en pesos enteros del año y actualiza las tarifas indexadas en SMMLV.',
  })
  @ApiOkResponse({ type: SmmlvDto })
  @ApiErrores(400, 401, 403)
  guardar(
    @Param('anio', ParseIntPipe) anio: number,
    @Body() datos: GuardarSmmlvDto,
  ): Promise<SmmlvDto> {
    return this.servicio.guardar(anio, datos);
  }
}
