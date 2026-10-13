import { Global, Module } from '@nestjs/common';
import { ConsecutivoService } from './consecutivos/consecutivo.service.js';

@Global()
@Module({
  providers: [ConsecutivoService],
  exports: [ConsecutivoService],
})
export class SharedModule {}
