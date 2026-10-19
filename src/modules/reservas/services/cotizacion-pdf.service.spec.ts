import { describe, expect, it, vi } from 'vitest';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { CotizacionPdfService, fechaLarga, horario, pesos } from './cotizacion-pdf.service.js';
import type { SolicitudesService } from './solicitudes.service.js';

const usuario: UsuarioAutenticado = {
  id: 'u-1',
  correo: 'ana@ejemplo.com',
  roles: ['SOLICITANTE'],
  dependencias: [],
  correoVerificado: true,
  esInstitucional: false,
};

const cotizacion = (cambios: Record<string, unknown> = {}) => ({
  consecutivo: 'COT-2026-0001',
  creadaEn: new Date('2026-10-22T15:00:00.000Z'),
  validaHasta: new Date('2026-10-24T15:00:00.000Z'),
  subtotal: 250_000,
  iva: 0,
  total: 250_000,
  depositoGarantia: 100_000,
  valorReferencia: 0,
  esExenta: false,
  ...cambios,
});

function crearEntorno(opciones: { solicitud?: unknown } = {}) {
  const solicitud =
    opciones.solicitud === undefined
      ? {
          consecutivo: 'SOL-2026-0001',
          objetoEvento: 'Congreso de Ingeniería',
          asistentesEstimados: 120,
          solicitante: { nombres: 'Ana', apellidos: 'Pérez', razonSocial: null },
          reservas: [
            {
              inicio: new Date('2026-11-03T13:00:00.000Z'),
              fin: new Date('2026-11-03T17:00:00.000Z'),
              subtotal: 200_000,
              espacio: { codigo: 'B-101', nombre: 'Auditorio Mayor' },
            },
          ],
          servicios: [
            { servicio: { nombre: 'Sonido profesional' }, cantidad: 1, valorUnitario: 50_000, subtotal: 50_000 },
          ],
          cotizaciones: [cotizacion()],
        }
      : opciones.solicitud;
  const prisma = { solicitud: { findUnique: vi.fn().mockResolvedValue(solicitud) } };
  const solicitudes = { asegurarVisible: vi.fn().mockResolvedValue(undefined) };
  const servicio = new CotizacionPdfService(
    prisma as unknown as PrismaService,
    solicitudes as unknown as SolicitudesService,
  );
  return { servicio, prisma, solicitudes };
}

describe('formato', () => {
  it('muestra pesos colombianos sin decimales', () => {
    expect(pesos(250_000).replace(/\s/g, ' ')).toMatch(/250\.000/);
    expect(pesos(0)).toMatch(/0/);
  });

  it('muestra fecha y horario en hora de Bogotá', () => {
    expect(fechaLarga(new Date('2026-11-03T13:00:00.000Z'))).toMatch(/3 de noviembre de 2026/);
    expect(horario(new Date('2026-11-03T13:00:00.000Z'), new Date('2026-11-03T17:00:00.000Z'))).toContain('08:00');
  });
});

describe('CotizacionPdfService.generar', () => {
  it('genera un PDF válido con el consecutivo como nombre', async () => {
    const e = crearEntorno();
    const r = await e.servicio.generar('sol-1', usuario);

    expect(e.solicitudes.asegurarVisible).toHaveBeenCalledWith('sol-1', usuario);
    expect(r.nombre).toBe('COT-2026-0001.pdf');
    expect(r.contenido.subarray(0, 5).toString()).toBe('%PDF-');
    expect(r.contenido.length).toBeGreaterThan(1_000);
    expect(r.contenido.subarray(-6).toString()).toContain('%%EOF');
  });

  it('genera el PDF de una solicitud exenta y de una empresa', async () => {
    const exenta = crearEntorno({
      solicitud: {
        consecutivo: null,
        objetoEvento: 'Reunión',
        asistentesEstimados: 10,
        solicitante: { nombres: 'Empresa', apellidos: null, razonSocial: 'Empresa S.A.S.' },
        reservas: [],
        servicios: [],
        cotizaciones: [cotizacion({ esExenta: true, total: 0, depositoGarantia: 0, valorReferencia: 80_000 })],
      },
    });
    const r = await exenta.servicio.generar('sol-2', usuario);
    expect(r.contenido.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('sin cotización responde 404', async () => {
    const e = crearEntorno({ solicitud: { cotizaciones: [] } });
    await expect(e.servicio.generar('sol-1', usuario)).rejects.toMatchObject({
      codigo: 'NO_ENCONTRADO',
      status: 404,
    });
  });

  it('una solicitud fuera de alcance no llega a consultar la cotización', async () => {
    const e = crearEntorno();
    e.solicitudes.asegurarVisible.mockRejectedValue(
      Object.assign(new Error('no existe'), { codigo: 'NO_ENCONTRADO', status: 404 }),
    );
    await expect(e.servicio.generar('x', usuario)).rejects.toMatchObject({ status: 404 });
    expect(e.prisma.solicitud.findUnique).not.toHaveBeenCalled();
  });
});
