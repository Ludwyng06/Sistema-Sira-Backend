import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles ,
  UsuarioActual,
  type UsuarioAutenticado,
} from '../../../shared/auth/decoradores.js';
import { ApiErrores } from '../../../shared/errores/api-errores.js';
import { Auditar } from '../../auditoria/auditar.decorador.js';
import {
  ActualizarElementoDto,
  CrearElementoDto,
  ElementoAdminDto,
  FiltrosElementosDto,
  PaginaElementosDto,
} from '../dto/catalogo-admin.dto.js';
import { ElementosAdminService } from '../services/elementos-admin.service.js';

@ApiTags('Inventario · administración')
@ApiBearerAuth()
@Controller('elementos')
export class ElementosAdminController {
  constructor(private readonly servicio: ElementosAdminService) {}

  @Get()
  @Roles('ADMINISTRADOR', 'RESPONSABLE_ESPACIO', 'AUDITOR')
  @ApiOperation({
    summary: 'Lista los elementos del inventario.',
    description:
      'Paginada; filtra por espacio y por estado. Incluye los dados de baja. El responsable solo consulta elementos de sus espacios no archivados.\n\nErrores: 404 NO_ENCONTRADO (espacio ajeno o archivado).',
  })
  @ApiOkResponse({ type: PaginaElementosDto })
  @ApiErrores(400, 401, 403, 404)
  listar(@Query() filtros: FiltrosElementosDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<PaginaElementosDto> {
    return this.servicio.listar(filtros, usuario);
  }

  @Get(':id')
  @Roles('ADMINISTRADOR', 'AUDITOR')
  @ApiOperation({
    summary: 'Detalle de un elemento.',
    description: 'Errores: 404 NO_ENCONTRADO.',
  })
  @ApiOkResponse({ type: ElementoAdminDto })
  @ApiErrores(400, 401, 403, 404)
  obtener(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ElementoAdminDto> {
    return this.servicio.obtener(id);
  }

  @Post()
  @Roles('ADMINISTRADOR')
  @Auditar('ELEMENTO_CREADO', 'Elemento')
  @ApiOperation({
    summary: 'Registra un elemento en un espacio.',
    description:
      'La placa de inventario, si se indica, es única en toda la institución.\n\n' +
      'Errores: 404 NO_ENCONTRADO (espacio); 409 PLACA_REGISTRADA; 422 ESPACIO_ARCHIVADO.',
  })
  @ApiCreatedResponse({ type: ElementoAdminDto })
  @ApiErrores(400, 401, 403, 404, 409, 422)
  crear(@Body() datos: CrearElementoDto): Promise<ElementoAdminDto> {
    return this.servicio.crear(datos);
  }

  @Patch(':id')
  @Roles('ADMINISTRADOR')
  @Auditar('ELEMENTO_ACTUALIZADO', 'Elemento')
  @ApiOperation({
    summary: 'Modifica un elemento, lo traslada de espacio o cambia su estado.',
    description:
      'Errores: 404 NO_ENCONTRADO; 409 PLACA_REGISTRADA; 422 ESPACIO_ARCHIVADO.',
  })
  @ApiOkResponse({ type: ElementoAdminDto })
  @ApiErrores(400, 401, 403, 404, 409, 422)
  actualizar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() datos: ActualizarElementoDto,
  ): Promise<ElementoAdminDto> {
    return this.servicio.actualizar(id, datos);
  }

  @Patch(':id/baja')
  @Roles('ADMINISTRADOR')
  @Auditar('ELEMENTO_DADO_DE_BAJA', 'Elemento')
  @ApiOperation({
    summary: 'Da de baja un elemento.',
    description:
      'Nada se borra: el elemento queda DADO_DE_BAJA y deja de ser prestable. Es idempotente.\n\n' +
      'Errores: 404 NO_ENCONTRADO.',
  })
  @ApiOkResponse({ type: ElementoAdminDto })
  @ApiErrores(400, 401, 403, 404)
  darDeBaja(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ElementoAdminDto> {
    return this.servicio.darDeBaja(id);
  }
}
