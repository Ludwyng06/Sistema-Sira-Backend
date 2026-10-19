import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Publico } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import { BuscarDisponibilidadDto } from '../dto/buscar-disponibilidad.dto.js';
import { ConsultaDisponibilidadDto } from '../dto/consulta-disponibilidad.dto.js';
import { ConsultaOcupacionDto, OcupacionSedeDto } from '../dto/ocupacion.dto.js';
import { DisponibilidadDto, ResultadoBusquedaDto } from '../dto/respuestas.js';
import { BusquedaService } from '../services/busqueda.service.js';
import { DisponibilidadService } from '../services/disponibilidad.service.js';
import { OcupacionService } from '../services/ocupacion.service.js';

@ApiTags('Disponibilidad')
@Publico()
@Controller('disponibilidad')
export class DisponibilidadController {
  constructor(
    private readonly servicio: DisponibilidadService,
    private readonly busqueda: BusquedaService,
    private readonly ocupacion: OcupacionService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Franjas ocupadas de un espacio en un rango de fechas.',
    description:
      'Devuelve las franjas retenidas, confirmadas o bloqueadas que cruzan el rango [desde, hasta). ' +
      'El público solo ve el estado y una etiqueta ("Ocupado" o la etiqueta pública); nunca datos personales. ' +
      'El rango máximo es de 62 días.\n\n' +
      'Errores: 400 RANGO_INVALIDO; 404 NO_ENCONTRADO si el espacio no existe o no es reservable.',
  })
  @ApiOkResponse({ type: DisponibilidadDto })
  @ApiErrores(400, 404, 429)
  consultar(@Query() consulta: ConsultaDisponibilidadDto): Promise<DisponibilidadDto> {
    return this.servicio.consultar(consulta);
  }

  @Get('sede')
  @ApiOperation({
    summary: 'Ocupación agregada de una sede o un bloque en un rango.',
    description:
      'Por espacio y en total: horas de operación, horas ocupadas (reservas, retenciones y bloqueos) y ' +
      'porcentaje de ocupación. Solo cifras: nunca datos de quién reservó. El rango máximo es de 31 días.\n\n' +
      'Errores: 400 RANGO_INVALIDO; 404 NO_ENCONTRADO si la sede o el bloque no existen.',
  })
  @ApiOkResponse({ type: OcupacionSedeDto })
  @ApiErrores(400, 404, 429)
  ocupacionSede(@Query() consulta: ConsultaOcupacionDto): Promise<OcupacionSedeDto> {
    return this.ocupacion.consultar(consulta);
  }

  @Get('buscar')
  @ApiOperation({
    summary: 'Búsqueda inversa: espacios libres para una fecha, un horario y un aforo.',
    description:
      'Lista los espacios reservables donde caben los asistentes y que no tienen ocupación en el horario ' +
      'indicado (hora de Bogotá), del mejor ajuste al peor. Puede limitarse a una sede.\n\n' +
      'Errores: 400 RANGO_INVALIDO si la hora final no es posterior a la inicial o la fecha está en el pasado.',
  })
  @ApiOkResponse({ type: ResultadoBusquedaDto })
  @ApiErrores(400, 429)
  buscar(@Query() consulta: BuscarDisponibilidadDto): Promise<ResultadoBusquedaDto> {
    return this.busqueda.buscar(consulta);
  }
}
