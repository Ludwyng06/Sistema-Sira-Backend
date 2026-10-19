import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Auditar } from '../../auditoria/auditar.decorador.js';
import { Roles } from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import {
  ActualizarServicioDto,
  CrearServicioDto,
  FiltrosServiciosAdminDto,
  PaginaServiciosAdminDto,
  ServicioAdminDto,
} from '../dto/admin.dto.js';
import { ServiciosAdminService } from '../services/servicios-admin.service.js';

@ApiTags('Servicios')
@ApiBearerAuth()
@Roles('ADMINISTRADOR')
@Controller('servicios')
export class ServiciosAdminController {
  constructor(private readonly servicio: ServiciosAdminService) {}

  @Get('gestion')
  @ApiOperation({
    summary: 'Lista los servicios para administración, activos e inactivos.',
    description:
      'Paginada, por categoría y nombre; filtra por activo, categoría, proveedor y texto del nombre. ' +
      'El catálogo público es `GET /servicios`.',
  })
  @ApiOkResponse({ type: PaginaServiciosAdminDto })
  @ApiErrores(400, 401, 403)
  listar(@Query() filtros: FiltrosServiciosAdminDto): Promise<PaginaServiciosAdminDto> {
    return this.servicio.listar(filtros);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un servicio.', description: 'Errores: 404 NO_ENCONTRADO.' })
  @ApiOkResponse({ type: ServicioAdminDto })
  @ApiErrores(400, 401, 403, 404)
  obtener(@Param('id', new ParseUUIDPipe()) id: string): Promise<ServicioAdminDto> {
    return this.servicio.obtener(id);
  }

  @Post()
  @Auditar('SERVICIO_CREADO', 'Servicio')
  @ApiOperation({
    summary: 'Crea un servicio complementario.',
    description:
      'El proveedor debe estar activo y el nombre no se repite dentro del proveedor. tiposPermitidos vacío ' +
      'significa que aplica a todos los tipos de espacio.\n\n' +
      'Errores: 404 NO_ENCONTRADO (proveedor); 409 SERVICIO_DUPLICADO; ' +
      '422 PROVEEDOR_INACTIVO o TIPO_ESPACIO_INVALIDO.',
  })
  @ApiCreatedResponse({ type: ServicioAdminDto })
  @ApiErrores(400, 401, 403, 404, 409, 422)
  crear(@Body() datos: CrearServicioDto): Promise<ServicioAdminDto> {
    return this.servicio.crear(datos);
  }

  @Patch(':id')
  @Auditar('SERVICIO_ACTUALIZADO', 'Servicio')
  @ApiOperation({
    summary: 'Modifica un servicio.',
    description:
      'tiposPermitidos reemplaza la lista completa. Reactivar (activo=true) exige que el proveedor esté activo.\n\n' +
      'Errores: 404 NO_ENCONTRADO; 409 SERVICIO_DUPLICADO; 422 PROVEEDOR_INACTIVO o TIPO_ESPACIO_INVALIDO.',
  })
  @ApiOkResponse({ type: ServicioAdminDto })
  @ApiErrores(400, 401, 403, 404, 409, 422)
  actualizar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() datos: ActualizarServicioDto,
  ): Promise<ServicioAdminDto> {
    return this.servicio.actualizar(id, datos);
  }

  @Delete(':id')
  @HttpCode(204)
  @Auditar('SERVICIO_DESACTIVADO', 'Servicio')
  @ApiOperation({
    summary: 'Desactiva un servicio.',
    description:
      'Nada se borra: deja de aparecer en el catálogo, pero las solicitudes existentes lo conservan.\n\n' +
      'Errores: 404 NO_ENCONTRADO.',
  })
  @ApiNoContentResponse({ description: 'Servicio desactivado.' })
  @ApiErrores(400, 401, 403, 404)
  desactivar(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.servicio.desactivar(id);
  }
}
