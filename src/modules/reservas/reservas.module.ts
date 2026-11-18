import { Module } from '@nestjs/common';
import { DisponibilidadModule } from '../disponibilidad/disponibilidad.module.js';
import { NotificacionesModule } from '../notificaciones/notificaciones.module.js';
import { TarifarioModule } from '../tarifario/tarifario.module.js';
import { DocumentosController } from './controllers/documentos.controller.js';
import { ItemsController } from './controllers/items.controller.js';
import { SolicitudesController } from './controllers/solicitudes.controller.js';
import { CancelacionService } from './services/cancelacion.service.js';
import { CotizacionPdfService } from './services/cotizacion-pdf.service.js';
import { DecisionesService } from './services/decisiones.service.js';
import { DocumentosService } from './services/documentos.service.js';
import { EnvioService } from './services/envio.service.js';
import { ItemsService } from './services/items.service.js';
import { RecordatoriosService } from './jobs/recordatorios.service.js';
import { VencimientosService } from './jobs/vencimientos.service.js';
import { SolicitudesService } from './services/solicitudes.service.js';

@Module({
  imports: [TarifarioModule, NotificacionesModule, DisponibilidadModule],
  controllers: [SolicitudesController, ItemsController, DocumentosController],
  providers: [
    SolicitudesService,
    ItemsService,
    EnvioService,
    DecisionesService,
    CancelacionService,
    DocumentosService,
    VencimientosService,
    RecordatoriosService,
    CotizacionPdfService,
  ],
  exports: [SolicitudesService, ItemsService, EnvioService, DecisionesService, CancelacionService, DocumentosService],
})
export class ReservasModule {}
