import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { EstadoOrdenPago, EstadoSolicitud, Rol } from '../../../generated/prisma/enums.js';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { ConsultaTableroDto } from '../dto/tablero.dto.js';
import { TableroService } from './tablero.service.js';

export const TIPOS_REPORTE = ['solicitudes', 'recaudo', 'ocupacion'] as const;
export type TipoReporte = (typeof TIPOS_REPORTE)[number];
export type FormatoReporte = 'xlsx' | 'csv';

export const LIMITE_FILAS = 10_000;
const MS_DIA = 86_400_000;
const DIAS_POR_DEFECTO = 30;
const DIAS_MAXIMOS = 366;
const ROLES_GLOBALES: Rol[] = [Rol.ADMINISTRADOR, Rol.TESORERIA, Rol.AUDITOR];
const ROLES_RECAUDO: Rol[] = [Rol.ADMINISTRADOR, Rol.TESORERIA, Rol.AUDITOR];

export interface ArchivoReporte {
  contenido: Buffer;
  nombre: string;
  tipoMime: string;
}

interface Tabla {
  titulo: string;
  encabezados: string[];
  filas: (string | number | boolean | null)[][];
}

const MIME: Record<FormatoReporte, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
};

/**
 * Inyección de fórmulas: una celda de texto que empieza por =, +, - o @ (o por tabulación o retorno)
 * se interpreta como fórmula al abrirla en Excel o LibreOffice. Se antepone una comilla simple para
 * que se muestre como texto. Los datos de eventos y de solicitantes los escriben usuarios externos.
 */
export function neutralizarFormula<T extends string | number | boolean | null>(valor: T): T | string {
  return typeof valor === 'string' && /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
}

/** Una celda de CSV (RFC 4180): entre comillas si trae separador, comillas o saltos de línea. */
export function celdaCsv(valor: string | number | boolean | null): string {
  if (valor === null) return '';
  const texto = String(valor);
  return /[",\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

/** CSV con BOM UTF-8, para que Excel muestre bien las tildes. */
export function aCsv(tabla: Pick<Tabla, 'encabezados' | 'filas'>): Buffer {
  const lineas = [tabla.encabezados, ...tabla.filas].map((fila) => fila.map(celdaCsv).join(','));
  return Buffer.from(`﻿${lineas.join('\r\n')}\r\n`, 'utf8');
}

async function aXlsx(tabla: Tabla): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'SIRA';
  libro.created = new Date();
  const hoja = libro.addWorksheet(tabla.titulo.slice(0, 31));
  hoja.addRow(tabla.encabezados).font = { bold: true };
  for (const fila of tabla.filas) hoja.addRow(fila);
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: tabla.encabezados.length } };
  hoja.columns.forEach((columna, i) => {
    const mayor = Math.max(
      String(tabla.encabezados[i] ?? '').length,
      ...tabla.filas.map((f) => String(f[i] ?? '').length),
    );
    columna.width = Math.min(60, Math.max(12, mayor + 2));
  });
  return Buffer.from(await libro.xlsx.writeBuffer());
}

@Injectable()
export class ExportacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tablero: TableroService,
  ) {}

  /**
   * Exportación de reportes (RF-REP). El aprobador solo exporta lo de las dependencias de su alcance y
   * no el recaudo. El archivo nunca incluye documento, teléfono ni correo del solicitante.
   */
  async generar(
    tipo: TipoReporte,
    formato: FormatoReporte,
    consulta: ConsultaTableroDto,
    usuario: UsuarioAutenticado,
    ahora: Date = new Date(),
  ): Promise<ArchivoReporte> {
    const hasta = consulta.hasta ? new Date(consulta.hasta) : ahora;
    const desde = consulta.desde ? new Date(consulta.desde) : new Date(hasta.getTime() - DIAS_POR_DEFECTO * MS_DIA);
    if (hasta <= desde) {
      throw new ErrorDominio('RANGO_INVALIDO', 'La fecha final debe ser posterior a la inicial.', 400);
    }
    if (hasta.getTime() - desde.getTime() > DIAS_MAXIMOS * MS_DIA) {
      throw new ErrorDominio('RANGO_INVALIDO', `El periodo no puede superar ${DIAS_MAXIMOS} días.`, 400);
    }

    const global = usuario.roles.some((r) => ROLES_GLOBALES.includes(r));
    const dependencias = global ? null : usuario.dependencias;
    if (tipo === 'recaudo' && !usuario.roles.some((r) => ROLES_RECAUDO.includes(r))) {
      throw new ErrorDominio('SIN_PERMISO', 'Tu rol no puede exportar el recaudo.', 403);
    }

    const tabla =
      tipo === 'solicitudes'
        ? await this.solicitudes(desde, hasta, dependencias)
        : tipo === 'recaudo'
          ? await this.recaudo(desde, hasta)
          : await this.ocupacion(desde, hasta, dependencias);

    const segura: Tabla = { ...tabla, filas: tabla.filas.map((fila) => fila.map(neutralizarFormula)) };
    const contenido = formato === 'csv' ? aCsv(segura) : await aXlsx(segura);
    const periodo = `${desde.toISOString().slice(0, 10)}_${hasta.toISOString().slice(0, 10)}`;
    return { contenido, nombre: `sira-${tipo}-${periodo}.${formato}`, tipoMime: MIME[formato] };
  }

  private async solicitudes(desde: Date, hasta: Date, dependencias: string[] | null): Promise<Tabla> {
    const filas = await this.prisma.solicitud.findMany({
      where: {
        estado: { not: EstadoSolicitud.BORRADOR },
        creadoEn: { gte: desde, lte: hasta },
        ...(dependencias ? { dependenciaId: { in: dependencias } } : {}),
      },
      orderBy: { creadoEn: 'desc' },
      take: LIMITE_FILAS,
      select: {
        consecutivo: true,
        estado: true,
        objetoEvento: true,
        tipoTarifa: true,
        esExenta: true,
        asistentesEstimados: true,
        enviadaEn: true,
        creadoEn: true,
        solicitante: { select: { nombres: true, apellidos: true, razonSocial: true } },
      },
    });
    return {
      titulo: 'Solicitudes',
      encabezados: [
        'Consecutivo',
        'Estado',
        'Evento',
        'Solicitante',
        'Tipo de tarifa',
        'Exenta',
        'Asistentes',
        'Enviada',
        'Creada',
      ],
      filas: filas.map((f) => [
        f.consecutivo,
        f.estado,
        f.objetoEvento,
        f.solicitante.razonSocial ?? [f.solicitante.nombres, f.solicitante.apellidos].filter(Boolean).join(' '),
        f.tipoTarifa,
        f.esExenta,
        f.asistentesEstimados,
        f.enviadaEn?.toISOString() ?? null,
        f.creadoEn.toISOString(),
      ]),
    };
  }

  private async recaudo(desde: Date, hasta: Date): Promise<Tabla> {
    const filas = await this.prisma.ordenPago.findMany({
      where: { estado: EstadoOrdenPago.APROBADA, pagadoEn: { gte: desde, lte: hasta } },
      orderBy: { pagadoEn: 'desc' },
      take: LIMITE_FILAS,
      select: {
        referencia: true,
        valor: true,
        medio: true,
        pagadoEn: true,
        cotizacion: { select: { consecutivo: true, solicitud: { select: { consecutivo: true } } } },
      },
    });
    return {
      titulo: 'Recaudo',
      encabezados: ['Orden de pago', 'Solicitud', 'Cotización', 'Medio', 'Valor (COP)', 'Pagada'],
      filas: filas.map((f) => [
        f.referencia,
        f.cotizacion.solicitud.consecutivo,
        f.cotizacion.consecutivo,
        f.medio,
        f.valor,
        f.pagadoEn?.toISOString() ?? null,
      ]),
    };
  }

  private async ocupacion(desde: Date, hasta: Date, dependencias: string[] | null): Promise<Tabla> {
    const filas = await this.tablero.ocupacionPorEspacio(desde, hasta, dependencias);
    return {
      titulo: 'Ocupación',
      encabezados: ['Espacio', 'Nombre', 'Horas reservadas', 'Horas bloqueadas'],
      filas: filas
        .sort((a, b) => b.reservadas - a.reservadas || a.codigo.localeCompare(b.codigo))
        .slice(0, LIMITE_FILAS)
        .map((f) => [f.codigo, f.nombre, Math.round(f.reservadas * 100) / 100, Math.round(f.bloqueadas * 100) / 100]),
    };
  }
}
