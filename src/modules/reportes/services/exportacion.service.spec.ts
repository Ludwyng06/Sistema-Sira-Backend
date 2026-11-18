import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { aCsv, celdaCsv, ExportacionService, neutralizarFormula } from './exportacion.service.js';
import type { TableroService } from './tablero.service.js';

const AHORA = new Date('2026-10-30T15:00:00.000Z');

const usuario = (cambios: Partial<UsuarioAutenticado> = {}): UsuarioAutenticado => ({
  id: 'u-1',
  correo: 'admin@itp.edu.co',
  roles: ['ADMINISTRADOR'],
  dependencias: [],
  correoVerificado: true,
  esInstitucional: true,
  ...cambios,
});

function crearEntorno() {
  const prisma = {
    solicitud: {
      findMany: vi.fn().mockResolvedValue([
        {
          consecutivo: 'SOL-2026-0001',
          estado: 'CONFIRMADA',
          objetoEvento: 'Congreso, "Ingeniería"',
          tipoTarifa: 'EMPRESA',
          esExenta: false,
          asistentesEstimados: 120,
          enviadaEn: new Date('2026-10-21T15:00:00.000Z'),
          creadoEn: new Date('2026-10-20T15:00:00.000Z'),
          solicitante: { nombres: 'Ana', apellidos: 'Pérez', razonSocial: null },
        },
      ]),
    },
    ordenPago: {
      findMany: vi.fn().mockResolvedValue([
        {
          referencia: 'OP-2026-000001',
          valor: 350_000,
          medio: 'CONSIGNACION',
          pagadoEn: new Date('2026-10-23T15:00:00.000Z'),
          cotizacion: { consecutivo: 'COT-2026-0001', solicitud: { consecutivo: 'SOL-2026-0001' } },
        },
      ]),
    },
  };
  const tablero = {
    ocupacionPorEspacio: vi.fn().mockResolvedValue([
      { espacioId: 'e1', codigo: 'A-1', nombre: 'Aula 1', reservadas: 4.456, bloqueadas: 10 },
      { espacioId: 'e2', codigo: 'B-1', nombre: 'Aula 2', reservadas: 20, bloqueadas: 0 },
    ]),
  };
  const servicio = new ExportacionService(
    prisma as unknown as PrismaService,
    tablero as unknown as TableroService,
  );
  return { servicio, prisma, tablero };
}

describe('CSV', () => {
  it('escapa comillas, comas y saltos de línea', () => {
    expect(celdaCsv('simple')).toBe('simple');
    expect(celdaCsv('con, coma')).toBe('"con, coma"');
    expect(celdaCsv('dice "hola"')).toBe('"dice ""hola"""');
    expect(celdaCsv('a\nb')).toBe('"a\nb"');
    expect(celdaCsv(null)).toBe('');
    expect(celdaCsv(12)).toBe('12');
    expect(celdaCsv(true)).toBe('true');
  });

  it('antepone el BOM y separa las filas con CRLF', () => {
    const csv = aCsv({ encabezados: ['a', 'b'], filas: [['1', 2]] }).toString('utf8');
    expect(csv).toBe('\uFEFFa,b\r\n1,2\r\n');
  });
});

describe('ExportacionService.generar', () => {
  const MALICIOSO = [
    { estado: 'CONFIRMADA', objetoEvento: '=HYPERLINK("http://x.co","pulsa")' },
    { estado: 'CONFIRMADA', objetoEvento: '+cmd|calc' },
    { estado: 'CONFIRMADA', objetoEvento: '-2+3' },
    { estado: 'CONFIRMADA', objetoEvento: '@SUM(A1)' },
  ].map((f, i) => ({
    consecutivo: `SOL-2026-000${i}`,
    tipoTarifa: 'EMPRESA',
    esExenta: false,
    asistentesEstimados: 10,
    enviadaEn: null,
    creadoEn: new Date('2026-10-20T15:00:00.000Z'),
    solicitante: { nombres: i === 0 ? '=1+1' : 'Ana', apellidos: null, razonSocial: null },
    ...f,
  }));

  it('neutraliza en el CSV las celdas de texto que empiezan por =, +, - o @', async () => {
    const e = crearEntorno();
    e.prisma.solicitud.findMany.mockResolvedValue(MALICIOSO);
    const r = await e.servicio.generar('solicitudes', 'csv', {}, usuario(), AHORA);
    const texto = r.contenido.toString('utf8');

    expect(texto).toContain(`"'=HYPERLINK(""http://x.co"",""pulsa"")"`);
    expect(texto).toContain("'+cmd|calc");
    expect(texto).toContain("'-2+3");
    expect(texto).toContain("'@SUM(A1)");
    expect(texto).toContain("'=1+1");
    expect(texto).not.toMatch(/(^|,)[=+@]/m);
  });

  it('neutraliza las mismas celdas en el XLSX', async () => {
    const e = crearEntorno();
    e.prisma.solicitud.findMany.mockResolvedValue(MALICIOSO);
    const r = await e.servicio.generar('solicitudes', 'xlsx', {}, usuario(), AHORA);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(r.contenido as unknown as ArrayBuffer);
    const hoja = libro.worksheets[0]!;

    expect(hoja.getRow(2).getCell(3).value).toBe(`'=HYPERLINK("http://x.co","pulsa")`);
    expect(hoja.getRow(3).getCell(3).value).toBe("'+cmd|calc");
    expect(hoja.getRow(4).getCell(3).value).toBe("'-2+3");
    expect(hoja.getRow(5).getCell(3).value).toBe("'@SUM(A1)");
  });

  it('neutralizarFormula solo toca texto peligroso y deja números y fechas', () => {
    expect(neutralizarFormula('=A1')).toBe("'=A1");
    expect(neutralizarFormula('	dato')).toBe("'	dato");
    expect(neutralizarFormula('SOL-2026-0001')).toBe('SOL-2026-0001');
    expect(neutralizarFormula('2026-10-20T15:00:00.000Z')).toBe('2026-10-20T15:00:00.000Z');
    expect(neutralizarFormula(-5)).toBe(-5);
    expect(neutralizarFormula(null)).toBeNull();
    expect(neutralizarFormula(true)).toBe(true);
  });

  it('exporta solicitudes a CSV sin datos personales de contacto', async () => {
    const e = crearEntorno();
    const r = await e.servicio.generar('solicitudes', 'csv', {}, usuario(), AHORA);

    expect(r.nombre).toBe('sira-solicitudes-2026-09-30_2026-10-30.csv');
    expect(r.tipoMime).toContain('text/csv');
    const texto = r.contenido.toString('utf8');
    expect(texto).toContain('Consecutivo,Estado,Evento,Solicitante');
    expect(texto).toContain('SOL-2026-0001,CONFIRMADA,"Congreso, ""Ingeniería""",Ana Pérez');
    const { select } = e.prisma.solicitud.findMany.mock.calls[0]![0] as {
      select: { solicitante: { select: Record<string, boolean> } };
    };
    expect(Object.keys(select.solicitante.select).sort()).toEqual(['apellidos', 'nombres', 'razonSocial']);
  });

  it('exporta a XLSX con encabezado en negrita, filtro y una fila por registro', async () => {
    const e = crearEntorno();
    const r = await e.servicio.generar('recaudo', 'xlsx', {}, usuario(), AHORA);

    expect(r.tipoMime).toContain('spreadsheetml');
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(r.contenido as unknown as ArrayBuffer);
    const hoja = libro.getWorksheet('Recaudo');
    expect(hoja?.rowCount).toBe(2);
    expect(hoja?.getRow(1).font?.bold).toBe(true);
    expect(hoja?.getRow(2).getCell(1).value).toBe('OP-2026-000001');
    expect(hoja?.getRow(2).getCell(5).value).toBe(350_000);
  });

  it('la ocupación se ordena de más a menos horas reservadas y redondea', async () => {
    const e = crearEntorno();
    const r = await e.servicio.generar('ocupacion', 'csv', {}, usuario(), AHORA);
    const lineas = r.contenido.toString('utf8').trim().split('\r\n');
    expect(lineas[1]).toBe('\uFEFFB-1,Aula 2,20,0'.slice(1));
    expect(lineas[2]).toBe('A-1,Aula 1,4.46,10');
  });

  it('el aprobador solo exporta su alcance y no puede exportar el recaudo', async () => {
    const e = crearEntorno();
    const aprobador = usuario({ roles: ['APROBADOR'], dependencias: ['dep-1'] });
    await e.servicio.generar('solicitudes', 'csv', {}, aprobador, AHORA);
    const { where } = e.prisma.solicitud.findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(where).toMatchObject({ dependenciaId: { in: ['dep-1'] }, estado: { not: 'BORRADOR' } });

    await e.servicio.generar('ocupacion', 'csv', {}, aprobador, AHORA);
    expect(e.tablero.ocupacionPorEspacio).toHaveBeenCalledWith(expect.any(Date), expect.any(Date), ['dep-1']);

    await expect(e.servicio.generar('recaudo', 'csv', {}, aprobador, AHORA)).rejects.toMatchObject({
      codigo: 'SIN_PERMISO',
      status: 403,
    });
  });

  it.each([
    ['hasta anterior a desde', { desde: '2026-10-20T00:00:00.000Z', hasta: '2026-10-01T00:00:00.000Z' }],
    ['más de 366 días', { desde: '2025-01-01T00:00:00.000Z', hasta: '2026-10-01T00:00:00.000Z' }],
  ])('rechaza %s con 400 RANGO_INVALIDO', async (_caso, consulta) => {
    const e = crearEntorno();
    await expect(e.servicio.generar('solicitudes', 'csv', consulta, usuario(), AHORA)).rejects.toMatchObject({
      codigo: 'RANGO_INVALIDO',
      status: 400,
    });
  });
});
