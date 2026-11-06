import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { noEncontrado } from '../../../shared/errores/error-dominio.js';
import {
  ANCHO_UTIL_PDF,
  construirPdf,
  dibujarTabla,
  type FilaTabla,
  fechaLarga,
  horaLocal,
  horario,
  MARGEN_PDF,
  pesos,
} from '../../../shared/pdf/formato-pdf.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { SolicitudesService } from './solicitudes.service.js';

export { fechaLarga, horario, pesos };

export interface CotizacionPdf {
  contenido: Buffer;
  nombre: string;
}

@Injectable()
export class CotizacionPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly solicitudes: SolicitudesService,
  ) {}

  /** PDF tamaño carta de la última cotización; lo ve quien ve la solicitud (404 si no hay cotización). */
  async generar(solicitudId: string, usuario: UsuarioAutenticado): Promise<CotizacionPdf> {
    await this.solicitudes.asegurarVisible(solicitudId, usuario);
    const solicitud = await this.prisma.solicitud.findUnique({
      where: { id: solicitudId },
      include: {
        solicitante: { select: { nombres: true, apellidos: true, razonSocial: true } },
        reservas: {
          orderBy: { inicio: 'asc' },
          include: { espacio: { select: { codigo: true, nombre: true } } },
        },
        servicios: { include: { servicio: { select: { nombre: true } } } },
        cotizaciones: { orderBy: { creadaEn: 'desc' }, take: 1 },
      },
    });
    const cotizacion = solicitud?.cotizaciones[0];
    if (!solicitud || !cotizacion) throw noEncontrado('La cotización');

    const contenido = await construirPdf(PDFDocument, cotizacion.consecutivo, (doc) => {
    doc.font('Helvetica-Bold').fontSize(10).text('INSTITUCIÓN UNIVERSITARIA DEL PUTUMAYO', { align: 'center' });
    doc.font('Helvetica').fontSize(9).text('Sistema SIRA · Reserva de espacios y servicios', { align: 'center' });
    doc.moveDown(1.2);
    doc.font('Helvetica-Bold').fontSize(16).text(`Cotización ${cotizacion.consecutivo}`);
    doc.moveDown(0.3);
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(`Solicitud: ${solicitud.consecutivo ?? 'sin consecutivo'}`)
      .text(`Emitida: ${fechaLarga(cotizacion.creadaEn)}`)
      .text(`Válida hasta: ${fechaLarga(cotizacion.validaHasta)} ${horaLocal(cotizacion.validaHasta)}`);
    doc.moveDown(0.8);

    const solicitante =
      solicitud.solicitante.razonSocial ??
      [solicitud.solicitante.nombres, solicitud.solicitante.apellidos].filter(Boolean).join(' ');
    doc.font('Helvetica-Bold').fontSize(11).text('Evento');
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(`Solicitante: ${solicitante}`)
      .text(`Objeto: ${solicitud.objetoEvento}`)
      .text(`Asistentes estimados: ${solicitud.asistentesEstimados}`);
    doc.moveDown(0.8);

    dibujarTabla(
      doc,
      'Espacios',
      ['Espacio', 'Fecha', 'Horario', 'Valor'],
      [200, 130, 100, 82],
      solicitud.reservas.map((r) => ({
        columnas: [
          `${r.espacio.codigo} · ${r.espacio.nombre}`,
          fechaLarga(r.inicio),
          horario(r.inicio, r.fin),
          pesos(r.subtotal),
        ],
      })),
    );
    if (solicitud.servicios.length > 0) {
      dibujarTabla(
        doc,
        'Servicios complementarios',
        ['Servicio', 'Cantidad', 'Valor unitario', 'Valor'],
        [200, 70, 100, 142],
        solicitud.servicios.map((s) => ({
          columnas: [s.servicio.nombre, String(s.cantidad), pesos(s.valorUnitario), pesos(s.subtotal)],
        })),
      );
    }

    const totales: FilaTabla[] = [
      { columnas: ['Subtotal', pesos(cotizacion.subtotal)] },
      { columnas: ['IVA', pesos(cotizacion.iva)] },
      ...(cotizacion.depositoGarantia > 0
        ? [{ columnas: ['Depósito de garantía (reembolsable)', pesos(cotizacion.depositoGarantia)] }]
        : []),
      {
        columnas: [
          cotizacion.esExenta ? 'Total a pagar (uso institucional)' : 'Total a pagar',
          pesos(cotizacion.esExenta ? 0 : cotizacion.total + cotizacion.depositoGarantia),
        ],
        negrita: true,
      },
    ];
    dibujarTabla(doc, 'Resumen', [], [412, 132], totales);

    if (cotizacion.esExenta) {
      doc
        .font('Helvetica')
        .fontSize(9)
        .text(
          `Uso institucional sin costo. Valor de referencia: ${pesos(cotizacion.valorReferencia)}.`,
          MARGEN_PDF,
          doc.y + 6,
          { width: ANCHO_UTIL_PDF },
        );
    } else {
      doc
        .font('Helvetica')
        .fontSize(9)
        .text(
          'Para pagar, genera la orden de pago desde el detalle de la solicitud en SIRA y consigna con la ' +
            'referencia que se te indique. Los valores están en pesos colombianos. La tarifa quedó fijada ' +
            'al emitir esta cotización.',
          MARGEN_PDF,
          doc.y + 6,
          { width: ANCHO_UTIL_PDF },
        );
    }

    });
    return { contenido, nombre: `${cotizacion.consecutivo}.pdf` };
  }
}
