import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { InventarioModule } from './modules/inventario/inventario.module.js';
import { SaludController } from './salud.controller.js';
import { JwtAuthGuard, RolesGuard } from './shared/auth/guardas.js';
import { JwtStrategy } from './shared/auth/jwt.strategy.js';
import { validarConfiguracion } from './shared/config/configuracion.js';
import { FiltroErrores } from './shared/errores/filtro-errores.js';
import { PrismaModule } from './shared/prisma/prisma.module.js';
import { SharedModule } from './shared/shared.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validarConfiguracion }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PassportModule,
    PrismaModule,
    SharedModule,
    InventarioModule,
  ],
  controllers: [SaludController],
  providers: [
    JwtStrategy,
    { provide: APP_FILTER, useClass: FiltroErrores },
    // El orden importa: límite de peticiones, sesión y luego roles.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
