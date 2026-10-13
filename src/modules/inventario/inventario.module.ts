import { Module } from '@nestjs/common';
import { EspaciosAdminController } from './controllers/espacios-admin.controller.js';
import { InventarioPublicoController } from './controllers/inventario-publico.controller.js';
import { EspaciosAdminService } from './services/espacios-admin.service.js';
import { InventarioPublicoService } from './services/inventario-publico.service.js';

@Module({
  controllers: [InventarioPublicoController, EspaciosAdminController],
  providers: [InventarioPublicoService, EspaciosAdminService],
  exports: [InventarioPublicoService],
})
export class InventarioModule {}
