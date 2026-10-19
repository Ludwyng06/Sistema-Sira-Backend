import { Module } from '@nestjs/common';
import { BloquesAdminController } from './controllers/bloques-admin.controller.js';
import { ElementosAdminController } from './controllers/elementos-admin.controller.js';
import { EspaciosAdminController } from './controllers/espacios-admin.controller.js';
import { InventarioPublicoController } from './controllers/inventario-publico.controller.js';
import { SedesAdminController } from './controllers/sedes-admin.controller.js';
import { TiposEspacioAdminController } from './controllers/tipos-espacio-admin.controller.js';
import { BloquesAdminService } from './services/bloques-admin.service.js';
import { ElementosAdminService } from './services/elementos-admin.service.js';
import { EspaciosAdminService } from './services/espacios-admin.service.js';
import { InventarioPublicoService } from './services/inventario-publico.service.js';
import { SedesAdminService } from './services/sedes-admin.service.js';
import { TiposEspacioAdminService } from './services/tipos-espacio-admin.service.js';

@Module({
  controllers: [
    InventarioPublicoController,
    EspaciosAdminController,
    SedesAdminController,
    BloquesAdminController,
    TiposEspacioAdminController,
    ElementosAdminController,
  ],
  providers: [
    InventarioPublicoService,
    EspaciosAdminService,
    SedesAdminService,
    BloquesAdminService,
    TiposEspacioAdminService,
    ElementosAdminService,
  ],
  exports: [InventarioPublicoService],
})
export class InventarioModule {}
