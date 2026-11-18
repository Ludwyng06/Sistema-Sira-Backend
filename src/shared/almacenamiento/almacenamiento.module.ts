import { Global, Module } from '@nestjs/common';
import { ALMACENAMIENTO } from './almacenamiento.port.js';
import { DiscoLocalAdapter } from './disco-local.adapter.js';

@Global()
@Module({
  providers: [{ provide: ALMACENAMIENTO, useClass: DiscoLocalAdapter }],
  exports: [ALMACENAMIENTO],
})
export class AlmacenamientoModule {}
