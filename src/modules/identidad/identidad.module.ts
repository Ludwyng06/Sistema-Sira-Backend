import { Module } from '@nestjs/common';
import { NotificacionesModule } from '../notificaciones/notificaciones.module.js';
import { AuthController } from './controllers/auth.controller.js';
import { AuthService } from './services/auth.service.js';
import { CodigoVerificacionService } from './services/codigo-verificacion.service.js';

@Module({
  imports: [NotificacionesModule],
  controllers: [AuthController],
  providers: [AuthService, CodigoVerificacionService],
  exports: [AuthService],
})
export class IdentidadModule {}
