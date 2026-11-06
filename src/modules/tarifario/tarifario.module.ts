import { Module } from '@nestjs/common';
import { FestivosAdminController } from './controllers/festivos-admin.controller.js';
import { RecargosAdminController } from './controllers/recargos-admin.controller.js';
import { SmmlvAdminController } from './controllers/smmlv-admin.controller.js';
import { TarifasAdminController } from './controllers/tarifas-admin.controller.js';
import { TarifasController } from './controllers/tarifas.controller.js';
import { FestivosAdminService } from './services/festivos-admin.service.js';
import { RecargosAdminService } from './services/recargos-admin.service.js';
import { SmmlvAdminService } from './services/smmlv-admin.service.js';
import { TarifarioService } from './services/tarifario.service.js';
import { TarifasAdminService } from './services/tarifas-admin.service.js';

@Module({
  controllers: [
    TarifasController,
    TarifasAdminController,
    RecargosAdminController,
    FestivosAdminController,
    SmmlvAdminController,
  ],
  providers: [
    TarifarioService,
    TarifasAdminService,
    RecargosAdminService,
    FestivosAdminService,
    SmmlvAdminService,
  ],
  exports: [TarifarioService],
})
export class TarifarioModule {}
