import { Body, Controller, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../../shared/auth/decoradores.js';
import { CrearEspacioDto } from '../dto/crear-espacio.dto.js';
import { EspacioCreadoDto } from '../dto/respuestas.js';
import { EspaciosAdminService } from '../services/espacios-admin.service.js';

@ApiTags('Inventario · administración')
@ApiBearerAuth()
@Roles('ADMINISTRADOR')
@Controller('espacios')
export class EspaciosAdminController {
  constructor(private readonly servicio: EspaciosAdminService) {}

  @Post()
  @ApiOperation({ summary: 'Crea un espacio.' })
  @ApiCreatedResponse({ type: EspacioCreadoDto })
  @ApiConflictResponse({ description: 'Ya existe un espacio con ese código.' })
  crear(@Body() datos: CrearEspacioDto): Promise<EspacioCreadoDto> {
    return this.servicio.crear(datos);
  }

  @Patch(':codigo/archivar')
  @HttpCode(204)
  @ApiOperation({ summary: 'Archiva un espacio (nunca se borra).' })
  @ApiNoContentResponse({ description: 'Espacio archivado.' })
  @ApiConflictResponse({ description: 'El espacio tiene reservas futuras.' })
  archivar(@Param('codigo') codigo: string): Promise<void> {
    return this.servicio.archivar(codigo);
  }
}
