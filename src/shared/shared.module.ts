import { Global, Module } from '@nestjs/common';
import { ConsecutivoService } from './consecutivos/consecutivo.service.js';
import { ParametroService } from './parametros/parametro.service.js';

@Global()
@Module({
  providers: [ConsecutivoService, ParametroService],
  exports: [ConsecutivoService, ParametroService],
})
export class SharedModule {}
