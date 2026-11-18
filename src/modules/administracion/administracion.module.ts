import { Module } from '@nestjs/common';
import { IdentidadModule } from '../identidad/identidad.module.js';
import { DependenciasAdminController } from './controllers/dependencias-admin.controller.js';
import { ParametrosAdminController } from './controllers/parametros-admin.controller.js';
import { UsuariosAdminController } from './controllers/usuarios-admin.controller.js';
import { DependenciasAdminService } from './services/dependencias-admin.service.js';
import { ParametrosAdminService } from './services/parametros-admin.service.js';
import { UsuariosAdminService } from './services/usuarios-admin.service.js';

@Module({
  imports: [IdentidadModule],
  controllers: [UsuariosAdminController, DependenciasAdminController, ParametrosAdminController],
  providers: [UsuariosAdminService, DependenciasAdminService, ParametrosAdminService],
  exports: [UsuariosAdminService, DependenciasAdminService, ParametrosAdminService],
})
export class AdministracionModule {}
