import { Module } from '@nestjs/common';
import { NotificacionesModule } from '../notificaciones/notificaciones.module.js';
import { PagosController } from './controllers/pagos.controller.js';
import { ReembolsosController } from './controllers/reembolsos.controller.js';
import { PagosService } from './services/pagos.service.js';

@Module({
  imports: [NotificacionesModule],
  controllers: [PagosController, ReembolsosController],
  providers: [PagosService],
  exports: [PagosService],
})
export class PagosModule {}
