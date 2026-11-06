import { Module } from '@nestjs/common';
import { NotificacionesModule } from '../notificaciones/notificaciones.module.js';
import { ActasController } from './controllers/actas.controller.js';
import { ActaPdfService } from './services/acta-pdf.service.js';
import { ActasService } from './services/actas.service.js';

@Module({
  imports: [NotificacionesModule],
  controllers: [ActasController],
  providers: [ActasService, ActaPdfService],
  exports: [ActasService],
})
export class ActasModule {}
