import { Module } from '@nestjs/common';
import { CORREO } from './correo/correo.port.js';
import { SmtpCorreoAdaptador } from './correo/smtp-correo.adaptador.js';
import { NotificacionesController } from './controllers/notificaciones.controller.js';
import { NotificacionesService } from './services/notificaciones.service.js';

@Module({
  controllers: [NotificacionesController],
  providers: [{ provide: CORREO, useClass: SmtpCorreoAdaptador }, NotificacionesService],
  exports: [CORREO, NotificacionesService],
})
export class NotificacionesModule {}
