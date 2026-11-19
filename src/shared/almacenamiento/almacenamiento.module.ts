import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ALMACENAMIENTO } from './almacenamiento.port.js';
import { validarProveedorAlmacenamiento } from './configuracion-almacenamiento.js';
import { DiscoLocalAdapter } from './disco-local.adapter.js';
import { S3Adapter } from './s3.adapter.js';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [{
    provide: ALMACENAMIENTO,
    inject: [ConfigService],
    useFactory: (config: ConfigService) => validarProveedorAlmacenamiento(config.get('ALMACENAMIENTO_PROVEEDOR')) === 's3'
      ? new S3Adapter(config)
      : new DiscoLocalAdapter(config),
  }],
  exports: [ALMACENAMIENTO],
})
export class AlmacenamientoModule {}
