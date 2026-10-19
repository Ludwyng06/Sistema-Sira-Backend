import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { NotificacionesModule } from '../notificaciones/notificaciones.module.js';
import { AuthController } from './controllers/auth.controller.js';
import { AuthService } from './services/auth.service.js';
import { CodigoVerificacionService } from './services/codigo-verificacion.service.js';
import { RecuperacionService } from './services/recuperacion.service.js';
import { SesionService } from './services/sesion.service.js';

@Module({
  imports: [
    NotificacionesModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRETO'),
        signOptions: { expiresIn: config.getOrThrow<string>('JWT_ACCESS_EXPIRA') as `${number}m` },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, CodigoVerificacionService, SesionService, RecuperacionService],
  exports: [AuthService, SesionService],
})
export class IdentidadModule {}
