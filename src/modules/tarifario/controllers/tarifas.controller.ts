import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Publico } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import { CalcularTarifaDto } from '../dto/calcular-tarifa.dto.js';
import { TarifaCalculadaDto } from '../dto/respuestas.js';
import { TarifarioService } from '../services/tarifario.service.js';

@ApiTags('Tarifas')
@Publico()
@Controller('tarifas')
export class TarifasController {
  constructor(private readonly servicio: TarifarioService) {}

  @Post('calcular')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Simula el valor de reservar un espacio. No persiste nada.',
    description:
      'Usa la tarifa vigente hoy para el tipo de solicitante, elige la unidad de cobro más barata para el ' +
      'solicitante y suma los recargos nocturno, dominical o festivo y el IVA cuando aplica. ' +
      'Valores en pesos enteros, desglosados por día (hora de Bogotá).\n\n' +
      'Errores: 400 RANGO_INVALIDO; 404 NO_ENCONTRADO; 422 TARIFA_NO_DEFINIDA o SMMLV_NO_DEFINIDO.',
  })
  @ApiOkResponse({ type: TarifaCalculadaDto })
  @ApiErrores(400, 404, 422, 429)
  async calcular(@Body() datos: CalcularTarifaDto): Promise<TarifaCalculadaDto> {
    return this.servicio.calcular({
      espacioId: datos.espacioId,
      tipoSolicitante: datos.tipoSolicitante,
      inicio: new Date(datos.inicio),
      fin: new Date(datos.fin),
    });
  }
}
