import { Module } from '@nestjs/common';
import { AuditoriaController } from './controllers/auditoria.controller.js';
import { AuditoriaService } from './services/auditoria.service.js';

@Module({
  controllers: [AuditoriaController],
  providers: [AuditoriaService],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
