import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import {
  decodificarCsv,
  fechaReal,
  ImportacionHorarioService,
  limpiarDescripcion,
} from './importacion-horario.service.js';

const admin: UsuarioAutenticado = {
  id: 'u-admin',
  correo: 'admin@itp.edu.co',
  roles: ['ADMINISTRADOR'],
  dependencias: [],
  correoVerificado: true,
  esInstitucional: true,
};
const contexto = { ip: '10.0.0.1', userAgent: 'vitest', correlacionId: 'corr-1' };
const ENCABEZADO = 'espacio,dia,horaInicio,horaFin,desde,hasta,descripcion\n';

function crearEntorno() {
  const tx = {
    bloqueoCalendario: { create: vi.fn().mockResolvedValue({ id: 'blq-1' }) },
    franjaOcupada: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  const prisma = {
    espacio: { findMany: vi.fn().mockResolvedValue([{ id: 'e1', codigo: 'A-101' }]) },
    franjaOcupada: { findMany: vi.fn().mockResolvedValue([]) },
    bitacora: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn((fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { servicio: new ImportacionHorarioService(prisma as unknown as PrismaService), prisma, tx };
}

beforeEach(() => {
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

describe('fechaReal', () => {
  it('acepta fechas del calendario y rechaza las que Date.parse correría al mes siguiente', () => {
    expect(fechaReal('2026-02-28')).toBe(Date.parse('2026-02-28T12:00:00Z'));
    expect(fechaReal('2028-02-29')).not.toBeNull();
    expect(fechaReal('2026-02-31')).toBeNull();
    expect(fechaReal('2026-04-31')).toBeNull();
    expect(fechaReal('2026-13-01')).toBeNull();
  });
});

describe('limpiarDescripcion', () => {
  it('quita caracteres de control, recorta y acota a 300 caracteres', () => {
    expect(limpiarDescripcion('  Cálculo\u0000 I\u0007  ')).toBe('Cálculo I');
    expect(limpiarDescripcion('a'.repeat(500))).toHaveLength(300);
    expect(limpiarDescripcion('\u0000\u0001')).toBeNull();
  });
});

describe('decodificarCsv', () => {
  it('lee UTF-8 y cae a Windows-1252 cuando el archivo no es UTF-8 válido', () => {
    expect(decodificarCsv(Buffer.from('MIÉ', 'utf8'))).toBe('MIÉ');
    expect(decodificarCsv(Buffer.from('MIÉ', 'latin1'))).toBe('MIÉ');
  });
});

describe('ImportacionHorarioService.importar (revisión)', () => {
  it('una fecha imposible como 2026-02-31 es un error de fila, no se corre al 3 de marzo', async () => {
    const e = crearEntorno();
    const r = await e.servicio.importar(
      Buffer.from(`${ENCABEZADO}A-101,LUN,08:00,10:00,2026-02-31,2026-05-30,Cálculo\n`, 'utf8'),
      admin,
      contexto,
    );
    expect(r.errores).toEqual([{ fila: 2, mensaje: 'El rango de fechas no es válido.' }]);
    expect(e.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('un archivo en Windows-1252 con el día «MIÉ» se importa', async () => {
    const e = crearEntorno();
    const r = await e.servicio.importar(
      Buffer.from(`${ENCABEZADO}A-101,MIÉ,08:00,10:00,2026-11-02,2026-11-30,Programación\n`, 'latin1'),
      admin,
      contexto,
    );
    expect(r.errores).toEqual([]);
    expect(r.bloqueosCreados).toBe(1);
    expect(e.tx.bloqueoCalendario.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ descripcion: 'Programación' }),
      select: { id: true },
    });
  });

  it('una descripción con caracteres de control se limpia antes de guardarla', async () => {
    const e = crearEntorno();
    await e.servicio.importar(
      Buffer.from(`${ENCABEZADO}A-101,LUN,08:00,10:00,2026-11-02,2026-11-30,"Cálculo\u0000 I"\n`, 'utf8'),
      admin,
      contexto,
    );
    expect(e.tx.bloqueoCalendario.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ descripcion: 'Cálculo I' }),
      select: { id: true },
    });
  });

  it('un error inesperado en una fila queda en el reporte y no tumba el resto de la importación', async () => {
    const e = crearEntorno();
    e.prisma.$transaction.mockRejectedValueOnce(new Error('conexión perdida'));
    const r = await e.servicio.importar(
      Buffer.from(
        `${ENCABEZADO}A-101,LUN,08:00,10:00,2026-11-02,2026-11-30,Uno\nA-101,MAR,08:00,10:00,2026-11-02,2026-11-30,Dos\n`,
        'utf8',
      ),
      admin,
      contexto,
    );

    expect(r.errores).toEqual([{ fila: 2, mensaje: 'No se pudo guardar la fila por un error interno.' }]);
    expect(r.bloqueosCreados).toBe(1);
    expect(e.prisma.bitacora.create).toHaveBeenCalledOnce();
  });
});
