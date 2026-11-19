import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validarProveedorCorreo } from '../../shared/config/configuracion.js';
import { BrevoApiCorreoAdaptador } from './correo/brevo-api-correo.adaptador.js';
import { CORREO } from './correo/correo.port.js';
import { SmtpCorreoAdaptador } from './correo/smtp-correo.adaptador.js';
import { NotificacionesController } from './controllers/notificaciones.controller.js';
import { NotificacionesService } from './services/notificaciones.service.js';

@Module({
  imports: [ConfigModule],
  controllers: [NotificacionesController],
  providers: [{
    provide: CORREO,
    inject: [ConfigService],
    useFactory: (config: ConfigService) =>
      validarProveedorCorreo(config.get('CORREO_PROVEEDOR')) === 'brevo-api'
        ? new BrevoApiCorreoAdaptador(config)
        : new SmtpCorreoAdaptador(config),
  }, NotificacionesService],
  exports: [CORREO, NotificacionesService],
})
export class NotificacionesModule {}
