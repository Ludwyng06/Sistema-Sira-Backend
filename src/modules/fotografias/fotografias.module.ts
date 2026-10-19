import { Module } from '@nestjs/common';
import { FotosEspacioController, FotosPublicasController } from './controllers/fotografias.controller.js';
import { FotografiasService } from './services/fotografias.service.js';

@Module({
  controllers: [FotosEspacioController, FotosPublicasController],
  providers: [FotografiasService],
  exports: [FotografiasService],
})
export class FotografiasModule {}
