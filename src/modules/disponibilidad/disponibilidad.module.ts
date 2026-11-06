import { Module } from '@nestjs/common';
import { BloqueosController } from './controllers/bloqueos.controller.js';
import { DisponibilidadController } from './controllers/disponibilidad.controller.js';
import { BloqueosService } from './services/bloqueos.service.js';
import { BusquedaService } from './services/busqueda.service.js';
import { DisponibilidadService } from './services/disponibilidad.service.js';
import { ImportacionHorarioService } from './services/importacion-horario.service.js';
import { OcupacionService } from './services/ocupacion.service.js';

@Module({
  controllers: [DisponibilidadController, BloqueosController],
  providers: [
    DisponibilidadService,
    BloqueosService,
    BusquedaService,
    OcupacionService,
    ImportacionHorarioService,
  ],
  exports: [DisponibilidadService, BloqueosService, BusquedaService, OcupacionService],
})
export class DisponibilidadModule {}
