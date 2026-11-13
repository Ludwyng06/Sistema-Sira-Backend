import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash } from 'node:crypto';
import PDFDocument from 'pdfkit';
import type { Prisma } from '../../../generated/prisma/client.js';
import { ALMACENAMIENTO, type AlmacenamientoPort } from '../../../shared/almacenamiento/almacenamiento.port.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { construirPdf, MARGEN_PDF, pesos } from '../../../shared/pdf/formato-pdf.js';
import { fechaLocal } from '../../../shared/tiempo/zona-horaria.js';
import { NotificacionesService } from '../../notificaciones/services/notificaciones.service.js';
import type { ConciliacionDto, DiferenciaConciliacionDto, FilaConciliacionDto, ProveedorConciliacionDto } from '../dto/conciliacion.dto.js';
import { compararExtracto, corteBogota, leerExtracto, sumar } from '../dominio/conciliacion.js';

const total = () => ({ cantidad: 0, valor: 0 });
type Orden = Prisma.OrdenPagoGetPayload<Record<string, never>>;
function fila(orden: Orden): FilaConciliacionDto {
  return { ordenId: orden.id, referencia: orden.referencia, proveedor: orden.pasarela, medio: orden.medio, estado: orden.estado,
    valor: orden.valor, transaccionExternaId: orden.transaccionExternaId, pagadoEn: orden.pagadoEn?.toISOString() ?? null };
}
@Injectable()
export class ConciliacionService {
  private readonly logger = new Logger(ConciliacionService.name);
  private enCurso = false;
  constructor(private readonly prisma: PrismaService, private readonly notificaciones: NotificacionesService,
    @Inject(ALMACENAMIENTO) private readonly almacenamiento: AlmacenamientoPort) {}

  async informe(fecha: string, archivo?: Buffer, usuarioId?: string): Promise<ConciliacionDto> {
    const { desde, hasta } = corteBogota(fecha);
    // Recaudo aprobado por fecha de pago; el resto de órdenes por fecha de creación.
    const ordenes = await this.prisma.ordenPago.findMany({ where: { OR: [
      { estado: 'APROBADA', pagadoEn: { gte: desde, lt: hasta } },
      { estado: { not: 'APROBADA' }, creadaEn: { gte: desde, lt: hasta } },
      { estado: 'APROBADA', pagadoEn: null, creadaEn: { gte: desde, lt: hasta } },
    ] }, orderBy: [{ creadaEn: 'asc' }, { id: 'asc' }] });
    const filas = ordenes.map(fila);
    const totales = { aprobadas: total(), rechazadas: total(), pendientes: total(), anuladas: total() };
    const proveedores = new Map<string, ProveedorConciliacionDto>();
    for (const f of filas) {
      const grupo = f.estado === 'APROBADA' ? 'aprobadas' : f.estado === 'RECHAZADA' ? 'rechazadas'
        : f.estado === 'ANULADA' || f.estado === 'VENCIDA' ? 'anuladas' : 'pendientes';
      sumar(totales[grupo], f.valor);
      const nombre = f.proveedor ?? f.medio;
      let proveedor = proveedores.get(nombre);
      if (!proveedor) { proveedor = { proveedor: nombre, aprobadas: total(), rechazadas: total(), pendientes: total() }; proveedores.set(nombre, proveedor); }
      if (grupo !== 'anuladas') sumar(proveedor[grupo], f.valor);
    }
    let diferencias: DiferenciaConciliacionDto[] = [];
    if (archivo !== undefined) {
      const extracto = leerExtracto(archivo, fecha); const conocidas = new Map(filas.map((f) => [f.referencia, f]));
      const referencias = extracto.filter((f) => !conocidas.has(f.referencia)).map((f) => f.referencia);
      for (let i = 0; i < referencias.length; i += 500) {
        const otras = await this.prisma.ordenPago.findMany({ where: { referencia: { in: referencias.slice(i, i + 500) } } });
        for (const otra of otras) conocidas.set(otra.referencia, fila(otra));
      }
      diferencias = compararExtracto(filas, extracto, [...conocidas.values()]);
      await this.prisma.bitacora.create({ data: { usuarioId: usuarioId ?? null, accion: 'CONCILIACION_EXTRACTO', entidad: 'Conciliacion', entidadId: fecha,
        datosDespues: { fecha, filas: extracto.length, sha256: createHash('sha256').update(archivo).digest('hex'), diferencias: diferencias.map((d) => ({ ...d })) } } });
    } else {
      // Se conserva solo el resumen de diferencias de la última comparación, nunca el CSV.
      const comparacion = await this.prisma.bitacora.findFirst({ where: { accion: 'CONCILIACION_EXTRACTO', entidad: 'Conciliacion', entidadId: fecha }, orderBy: { id: 'desc' } });
      const datos = comparacion?.datosDespues as { diferencias?: DiferenciaConciliacionDto[] } | null;
      diferencias = datos?.diferencias ?? [];
    }
    return { fecha, generadoEn: new Date().toISOString(), totales, porProveedor: [...proveedores.values()].sort((a, b) => a.proveedor.localeCompare(b.proveedor)), filas, diferencias };
  }

  async pdf(fecha: string, informe?: ConciliacionDto): Promise<Buffer> {
    const datos = informe ?? await this.informe(fecha);
    return construirPdf(PDFDocument, `Conciliacion ${fecha}`, (doc) => {
      const titulo = () => {
        doc.font('Helvetica-Bold').fontSize(13).text('SIRA - Conciliación diaria', { align: 'center' });
        doc.font('Helvetica').fontSize(9).text(`${fecha} - America/Bogota`, { align: 'center' }); doc.moveDown();
      };
      const escribir = (texto: string, negrita = false) => {
        doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
        const alto = doc.heightOfString(texto, { width: 512 }) + 6;
        if (doc.y + alto > 720) { doc.addPage(); titulo(); doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(9); }
        doc.text(texto, MARGEN_PDF, doc.y, { width: 512 }); doc.moveDown(0.35);
      };
      titulo(); escribir(`Generado: ${datos.generadoEn}`);
      for (const [estado, suma] of Object.entries(datos.totales)) escribir(`${estado}: ${suma.cantidad} | ${pesos(suma.valor)}`, true);
      escribir('Órdenes', true);
      for (const f of datos.filas) escribir(`${f.referencia} | ${f.proveedor ?? f.medio} | ${f.estado} | ${pesos(f.valor)}`);
      if (!datos.filas.length) escribir('Sin movimientos para este día.');
      escribir(`Diferencias: ${datos.diferencias.length}`, true);
      for (const d of datos.diferencias) escribir(`${d.tipo} - ${d.referencia ?? 'Sin referencia'}: ${d.detalle} Sistema: ${d.valorSistema === null ? '-' : pesos(d.valorSistema)}; extracto: ${d.valorExtracto === null ? '-' : pesos(d.valorExtracto)}.`);
      escribir('Sin CSV cargado, no se infiere ausencia en extracto. Las diferencias muestran la última comparación registrada.');
    });
  }

  @Cron('0 0 6 * * *', { timeZone: 'America/Bogota' })
  async diaria(ahora = new Date()): Promise<void> {
    if (this.enCurso) return; this.enCurso = true;
    try {
      const fecha = fechaLocal(new Date(ahora.getTime() - 86400_000));
      const informe = await this.informe(fecha); const contenido = await this.pdf(fecha, informe);
      await this.almacenamiento.guardar(`pagos/conciliacion/${fecha}.pdf`, contenido, 'application/pdf');
      const pendientes = await this.prisma.ordenPago.count({ where: { estado: { in: ['PENDIENTE', 'EN_VERIFICACION'] }, actualizadaEn: { lte: new Date(ahora.getTime() - 30 * 60_000) } } });
      const avisar = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`conciliacion-${fecha}`}))`;
        if (await tx.bitacora.findFirst({ where: { accion: 'CONCILIACION_DIARIA', entidad: 'Conciliacion', entidadId: fecha } })) return false;
        await tx.bitacora.create({ data: { accion: 'CONCILIACION_DIARIA', entidad: 'Conciliacion', entidadId: fecha,
          datosDespues: { fecha, pendientesAntiguos: pendientes, diferencias: informe.diferencias.length, pdf: `pagos/conciliacion/${fecha}.pdf` } } });
        return pendientes > 0 || informe.diferencias.length > 0;
      });
      if (avisar) {
        const usuarios = await this.prisma.usuarioRol.findMany({ where: { rol: 'TESORERIA', usuario: { activo: true } }, select: { usuarioId: true } });
        for (const id of new Set(usuarios.map((u) => u.usuarioId))) await this.notificaciones.notificarUsuario(id, {
          titulo: `Conciliación ${fecha}: revisión requerida`, cuerpo: `${pendientes} pagos pendientes por más de 30 minutos y ${informe.diferencias.length} diferencias registradas.`, enlace: '/pagos/conciliacion',
        });
      }
    } catch (error) { this.logger.error('No se pudo generar la conciliación diaria.', error instanceof Error ? error.stack : String(error)); }
    finally { this.enCurso = false; }
  }
}
