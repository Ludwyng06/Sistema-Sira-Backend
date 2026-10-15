import { Module } from '@nestjs/common';
import { CORREO } from './correo/correo.port.js';
import { SmtpCorreoAdaptador } from './correo/smtp-correo.adaptador.js';

@Module({
  providers: [{ provide: CORREO, useClass: SmtpCorreoAdaptador }],
  exports: [CORREO],
})
export class NotificacionesModule {}
