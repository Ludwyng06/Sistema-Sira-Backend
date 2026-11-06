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
  ActualizarProveedorDto,
  CrearProveedorDto,
  FiltrosProveedoresDto,
  PaginaProveedoresDto,
  ProveedorAdminDto,
} from '../dto/admin.dto.js';
import { ProveedoresAdminService } from '../services/proveedores-admin.service.js';

@ApiTags('Servicios')
@ApiBearerAuth()
@Roles('ADMINISTRADOR')
@Controller('proveedores')
export class ProveedoresAdminController {
  constructor(private readonly servicio: ProveedoresAdminService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista los proveedores de servicios.',
    description:
      'Paginada, por nombre. Incluye datos de contacto y el porcentaje de administración, que son privados: ' +
      'solo la administración los ve.',
  })
  @ApiOkResponse({ type: PaginaProveedoresDto })
  @ApiErrores(400, 401, 403)
  listar(@Query() filtros: FiltrosProveedoresDto): Promise<PaginaProveedoresDto> {
    return this.servicio.listar(filtros);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalle de un proveedor.',
    description: 'Errores: 404 NO_ENCONTRADO.',
  })
  @ApiOkResponse({ type: ProveedorAdminDto })
  @ApiErrores(400, 401, 403, 404)
  obtener(@Param('id', new ParseUUIDPipe()) id: string): Promise<ProveedorAdminDto> {
    return this.servicio.obtener(id);
  }

  @Post()
  @Auditar('PROVEEDOR_CREADO', 'Proveedor')
  @ApiOperation({
    summary: 'Crea un proveedor.',
    description: 'Errores: 409 PROVEEDOR_DUPLICADO si ya existe uno con el mismo nombre.',
  })
  @ApiCreatedResponse({ type: ProveedorAdminDto })
  @ApiErrores(400, 401, 403, 409)
  crear(@Body() datos: CrearProveedorDto): Promise<ProveedorAdminDto> {
    return this.servicio.crear(datos);
  }

  @Patch(':id')
  @Auditar('PROVEEDOR_ACTUALIZADO', 'Proveedor')
  @ApiOperation({
    summary: 'Modifica un proveedor.',
    description:
      'Con activo=false desactiva al proveedor y a todos sus servicios; con activo=true solo lo reactiva a él ' +
      '(sus servicios se reactivan uno a uno).\n\nErrores: 404 NO_ENCONTRADO; 409 PROVEEDOR_DUPLICADO.',
  })
  @ApiOkResponse({ type: ProveedorAdminDto })
  @ApiErrores(400, 401, 403, 404, 409)
  actualizar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() datos: ActualizarProveedorDto,
  ): Promise<ProveedorAdminDto> {
    return this.servicio.actualizar(id, datos);
  }

  @Delete(':id')
  @HttpCode(204)
  @Auditar('PROVEEDOR_DESACTIVADO', 'Proveedor')
  @ApiOperation({
    summary: 'Desactiva un proveedor.',
    description:
      'Nada se borra: el proveedor y todos sus servicios quedan inactivos y dejan de aparecer en el catálogo.\n\n' +
      'Errores: 404 NO_ENCONTRADO.',
  })
  @ApiNoContentResponse({ description: 'Proveedor desactivado.' })
  @ApiErrores(400, 401, 403, 404)
  desactivar(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.servicio.desactivar(id);
  }
}
