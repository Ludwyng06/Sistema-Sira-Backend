import { Module } from '@nestjs/common';
import { ReportesController } from './controllers/reportes.controller.js';
import { ExportacionService } from './services/exportacion.service.js';
import { TableroService } from './services/tablero.service.js';

@Module({
  controllers: [ReportesController],
  providers: [TableroService, ExportacionService],
  exports: [TableroService],
})
export class ReportesModule {}
