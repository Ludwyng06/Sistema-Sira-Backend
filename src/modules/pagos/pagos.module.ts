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
import { EpaycoAdapter } from './adaptadores/epayco.adapter.js';
import { BoldAdapter } from './adaptadores/bold.adapter.js';
import { EcollectAdapter } from './adaptadores/ecollect.adapter.js';
import { EpaycoCheckoutController } from './controllers/epayco-checkout.controller.js';
import { PASARELA, PASARELAS, type PasarelaPort, type RegistroPasarelas } from './puertos/pasarela.port.js';

@Module({
  imports: [NotificacionesModule],
  controllers: [PagosController, ReembolsosController, PasarelaController, EpaycoCheckoutController],
  providers: [PagosService, PasarelaService, WompiAdapter, EpaycoAdapter, BoldAdapter, EcollectAdapter, {
    provide: PASARELAS,
    inject: [WompiAdapter, EpaycoAdapter, BoldAdapter, EcollectAdapter],
    useFactory: (...adaptadores: PasarelaPort[]): RegistroPasarelas =>
      new Map<string, PasarelaPort>(adaptadores.map((adaptador): [string, PasarelaPort] => [adaptador.proveedor, adaptador])),
  }, {
    provide: PASARELA,
    inject: [ConfigService, PASARELAS],
    useFactory: (config: ConfigService, adaptadores: RegistroPasarelas) => {
      const proveedor = config.get<string>('PASARELA_PROVEEDOR') || 'ninguna';
      if (proveedor === 'ninguna') return new SinPasarelaAdapter();
      const adaptador = adaptadores.get(proveedor.toUpperCase());
      if (!adaptador) throw new Error('PASARELA_PROVEEDOR no está registrado.');
      return adaptador;
    },
  }],
  exports: [PagosService],
})
export class PagosModule {}
