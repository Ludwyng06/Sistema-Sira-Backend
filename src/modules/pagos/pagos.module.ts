import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificacionesModule } from '../notificaciones/notificaciones.module.js';
import { PagosController } from './controllers/pagos.controller.js';
import { ReembolsosController } from './controllers/reembolsos.controller.js';
import { PagosService } from './services/pagos.service.js';
import { PasarelaController } from './controllers/pasarela.controller.js';
import { PasarelaService } from './services/pasarela.service.js';
import { WompiAdapter } from './adaptadores/wompi.adapter.js';
import { SinPasarelaAdapter } from './adaptadores/sin-pasarela.adapter.js';
import { PASARELA } from './puertos/pasarela.port.js';

@Module({
  imports: [NotificacionesModule],
  controllers: [PagosController, ReembolsosController, PasarelaController],
  providers: [PagosService, PasarelaService, WompiAdapter, {
    provide: PASARELA,
    inject: [ConfigService, WompiAdapter],
    useFactory: (config: ConfigService, wompi: WompiAdapter) => {
      const proveedor = config.get<string>('PASARELA_PROVEEDOR') || 'ninguna';
      if (proveedor === 'ninguna') return new SinPasarelaAdapter();
      if (proveedor !== 'wompi') throw new Error('PASARELA_PROVEEDOR debe ser wompi o ninguna.');
      return wompi;
    },
  }],
  exports: [PagosService],
})
export class PagosModule {}
