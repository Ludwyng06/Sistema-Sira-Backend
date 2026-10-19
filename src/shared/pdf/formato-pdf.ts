import type PDFDocument from 'pdfkit';

export const MARGEN_PDF = 50;
/** Ancho útil de una página carta (612 pt) con los márgenes del proyecto. */
export const ANCHO_UTIL_PDF = 612 - MARGEN_PDF * 2;

const FORMATO_PESOS = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});
const FORMATO_FECHA = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});
const FORMATO_HORA = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function pesos(valor: number): string {
  return FORMATO_PESOS.format(valor);
}

export function fechaLarga(fecha: Date): string {
  return FORMATO_FECHA.format(fecha);
}

export function horaLocal(fecha: Date): string {
  return FORMATO_HORA.format(fecha);
}

export function horario(inicio: Date, fin: Date): string {
  return `${FORMATO_HORA.format(inicio)} – ${FORMATO_HORA.format(fin)}`;
}

export interface FilaTabla {
  columnas: string[];
  negrita?: boolean;
}

/** Dibuja un título y una tabla simple de columnas con ancho fijo; la última columna va a la derecha. */
export function dibujarTabla(
  doc: InstanceType<typeof PDFDocument>,
  titulo: string,
  encabezado: string[],
  anchos: number[],
  filas: FilaTabla[],
): void {
  doc.font('Helvetica-Bold').fontSize(11).text(titulo, MARGEN_PDF, doc.y);
  doc.moveDown(0.3);
  const dibujarFila = (columnas: string[], negrita: boolean) => {
    const y = doc.y;
    let x = MARGEN_PDF;
    let alto = 0;
    doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    columnas.forEach((texto, i) => {
      const ancho = anchos[i] ?? 100;
      const derecha = i === columnas.length - 1 && columnas.length > 1;
      doc.text(texto, x, y, { width: ancho - 6, align: derecha ? 'right' : 'left' });
      alto = Math.max(alto, doc.y - y);
      x += ancho;
    });
    doc.y = y + alto + 4;
  };
  if (encabezado.length > 0) {
    dibujarFila(encabezado, true);
    doc
      .moveTo(MARGEN_PDF, doc.y - 2)
      .lineTo(MARGEN_PDF + ANCHO_UTIL_PDF, doc.y - 2)
      .stroke();
  }
  for (const fila of filas) dibujarFila(fila.columnas, fila.negrita ?? false);
  doc.moveDown(0.8);
}

/** Genera el documento completo: el llamador dibuja y la función devuelve el PDF terminado. */
export async function construirPdf(
  PDF: typeof PDFDocument,
  titulo: string,
  dibujar: (doc: InstanceType<typeof PDFDocument>) => void,
): Promise<Buffer> {
  const doc = new PDF({ size: 'LETTER', margin: MARGEN_PDF, info: { Title: titulo } });
  const partes: Buffer[] = [];
  doc.on('data', (parte: Buffer) => partes.push(parte));
  const terminado = new Promise<Buffer>((resolver, rechazar) => {
    doc.on('end', () => resolver(Buffer.concat(partes)));
    doc.on('error', rechazar);
  });
  dibujar(doc);
  doc.end();
  return terminado;
}
