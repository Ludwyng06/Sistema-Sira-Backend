import { Module } from '@nestjs/common';
import { ProveedoresAdminController } from './controllers/proveedores-admin.controller.js';
import { ServiciosAdminController } from './controllers/servicios-admin.controller.js';
import { ServiciosController } from './controllers/servicios.controller.js';
import { ProveedoresAdminService } from './services/proveedores-admin.service.js';
import { ServiciosAdminService } from './services/servicios-admin.service.js';
import { ServiciosService } from './services/servicios.service.js';

@Module({
  controllers: [ServiciosController, ServiciosAdminController, ProveedoresAdminController],
  providers: [ServiciosService, ServiciosAdminService, ProveedoresAdminService],
  exports: [ServiciosService, ServiciosAdminService, ProveedoresAdminService],
})
export class ServiciosModule {}
