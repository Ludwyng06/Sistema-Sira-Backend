import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { noEncontrado } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import {
  ANCHO_UTIL_PDF,
  construirPdf,
  dibujarTabla,
  fechaLarga,
  horaLocal,
  MARGEN_PDF,
  pesos,
} from '../../../shared/pdf/formato-pdf.js';
import { ActasService } from './actas.service.js';

export interface ActaPdf {
  contenido: Buffer;
  nombre: string;
}

const ETIQUETA_ESTADO = { BUENO: 'Bueno', REGULAR: 'Regular', MALO: 'Malo' } as const;
const ETIQUETA_TRATAMIENTO: Record<string, string> = {
  DESCONTAR_DEPOSITO: 'Descontar del depósito',
  COBRO_ADICIONAL: 'Cobro adicional',
  SIN_COBRO: 'Sin cobro',
};

@Injectable()
export class ActaPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actas: ActasService,
  ) {}

  /** PDF tamaño carta del acta, con el mismo alcance que `GET /actas/:id` (otro usuario = 404). */
  async generar(id: string, usuario: UsuarioAutenticado): Promise<ActaPdf> {
    const acta = await this.actas.obtener(id, usuario);
    const contexto = await this.prisma.solicitud.findUnique({
      where: { id: acta.solicitudId },
      select: {
        consecutivo: true,
        objetoEvento: true,
        solicitante: { select: { nombres: true, apellidos: true, razonSocial: true } },
        reservas: { select: { espacio: { select: { codigo: true, nombre: true } } } },
      },
    });
    if (!contexto) throw noEncontrado('El acta');

    const tipo = acta.tipo === 'ENTREGA' ? 'entrega' : 'devolución';
    const generada = new Date(acta.generadaEn);
    const solicitante =
      contexto.solicitante.razonSocial ??
      [contexto.solicitante.nombres, contexto.solicitante.apellidos].filter(Boolean).join(' ');
    const espacios = [...new Set(contexto.reservas.map((r) => `${r.espacio.codigo} · ${r.espacio.nombre}`))];

    const contenido = await construirPdf(PDFDocument, acta.consecutivo, (doc) => {
      doc.font('Helvetica-Bold').fontSize(10).text('INSTITUCIÓN UNIVERSITARIA DEL PUTUMAYO', { align: 'center' });
      doc.font('Helvetica').fontSize(9).text('Sistema SIRA · Reserva de espacios y servicios', { align: 'center' });
      doc.moveDown(1.2);
      doc.font('Helvetica-Bold').fontSize(16).text(`Acta de ${tipo} ${acta.consecutivo}`);
      doc.moveDown(0.3);
      doc
        .font('Helvetica')
        .fontSize(10)
        .text(`Solicitud: ${contexto.consecutivo ?? 'sin consecutivo'}`)
        .text(`Fecha: ${fechaLarga(generada)} ${horaLocal(generada)}`)
        .text(`Solicitante: ${solicitante}`)
        .text(`Evento: ${contexto.objetoEvento}`)
        .text(`Espacios: ${espacios.join('; ')}`);
      doc.moveDown(0.8);

      dibujarTabla(
        doc,
        'Verificación de elementos',
        ['Elemento', 'Esperada', 'Encontrada', 'Estado', 'Resultado'],
        [200, 60, 70, 90, 124],
        acta.checklist.map((c) => ({
          columnas: [
            c.nombre,
            String(c.cantidadEsperada),
            String(c.cantidadEncontrada),
            ETIQUETA_ESTADO[c.estadoFisico],
            c.ok ? 'Conforme' : 'Con novedad',
          ],
        })),
      );
      if (acta.novedades.length > 0) {
        dibujarTabla(
          doc,
          'Novedades',
          ['Descripción', 'Tratamiento', 'Valor del daño'],
          [270, 150, 124],
          acta.novedades.map((n) => ({
            columnas: [n.descripcion, ETIQUETA_TRATAMIENTO[n.tratamiento] ?? n.tratamiento, pesos(n.valorDano)],
          })),
        );
      }
      if (acta.observaciones) {
        doc.font('Helvetica-Bold').fontSize(11).text('Observaciones', MARGEN_PDF, doc.y);
        doc.font('Helvetica').fontSize(10).text(acta.observaciones, { width: ANCHO_UTIL_PDF });
        doc.moveDown(0.8);
      }

      doc.moveDown(3);
      const y = doc.y;
      const ancho = ANCHO_UTIL_PDF / 2 - 20;
      doc.moveTo(MARGEN_PDF, y).lineTo(MARGEN_PDF + ancho, y).stroke();
      doc
        .moveTo(MARGEN_PDF + ancho + 40, y)
        .lineTo(MARGEN_PDF + ANCHO_UTIL_PDF, y)
        .stroke();
      doc.font('Helvetica').fontSize(9);
      doc.text('Responsable del espacio', MARGEN_PDF, y + 4, { width: ancho, align: 'center' });
      doc.text('Solicitante', MARGEN_PDF + ancho + 40, y + 4, { width: ancho, align: 'center' });
    });
    return { contenido, nombre: `${acta.consecutivo}.pdf` };
  }
}
