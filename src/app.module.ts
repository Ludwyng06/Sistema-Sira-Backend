import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ActasModule } from './modules/actas/actas.module.js';
import { AdministracionModule } from './modules/administracion/administracion.module.js';
import { AuditarInterceptor } from './modules/auditoria/auditar.interceptor.js';
import { AuditoriaModule } from './modules/auditoria/auditoria.module.js';
import { DisponibilidadModule } from './modules/disponibilidad/disponibilidad.module.js';
import { IdentidadModule } from './modules/identidad/identidad.module.js';
import { FotografiasModule } from './modules/fotografias/fotografias.module.js';
import { InventarioModule } from './modules/inventario/inventario.module.js';
import { PagosModule } from './modules/pagos/pagos.module.js';
import { ReportesModule } from './modules/reportes/reportes.module.js';
import { ReservasModule } from './modules/reservas/reservas.module.js';
import { ServiciosModule } from './modules/servicios/servicios.module.js';
import { TarifarioModule } from './modules/tarifario/tarifario.module.js';
import { AlmacenamientoModule } from './shared/almacenamiento/almacenamiento.module.js';
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
    ScheduleModule.forRoot(),
    PassportModule,
    PrismaModule,
    SharedModule,
    AlmacenamientoModule,
    IdentidadModule,
    InventarioModule,
    FotografiasModule,
    DisponibilidadModule,
    TarifarioModule,
    ServiciosModule,
    ReservasModule,
    PagosModule,
    ActasModule,
    ReportesModule,
    AuditoriaModule,
    AdministracionModule,
  ],
  controllers: [SaludController],
  providers: [
    JwtStrategy,
    { provide: APP_FILTER, useClass: FiltroErrores },
    { provide: APP_INTERCEPTOR, useClass: AuditarInterceptor },
    // El orden importa: límite de peticiones, sesión y luego roles.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
