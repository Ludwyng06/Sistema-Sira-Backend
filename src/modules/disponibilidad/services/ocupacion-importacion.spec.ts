import { describe, expect, it, vi } from 'vitest';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ImportacionHorarioService } from './importacion-horario.service.js';
import { OcupacionService } from './ocupacion.service.js';

const rechazo = (promesa: Promise<unknown>): Promise<unknown> => promesa.catch((e: unknown) => e);

describe('OcupacionService.consultar', () => {
  const horarioLaboral = [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, abre: '07:00', cierra: '19:00' }));

  function crearEntorno() {
    const prisma = {
      sede: { findFirst: vi.fn().mockResolvedValue({ id: 'sede-1', codigo: 'MOC', nombre: 'Mocoa' }) },
      bloque: { findFirst: vi.fn().mockResolvedValue({ id: 'blq-1', codigo: 'A', nombre: 'Bloque A' }) },
      espacio: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'e1', codigo: 'A-101', nombre: 'Aula 101', horarios: horarioLaboral },
          { id: 'e2', codigo: 'A-102', nombre: 'Aula 102', horarios: [] },
        ]),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ espacioId: 'e1', horas: 30 }]),
    };
    return { servicio: new OcupacionService(prisma as unknown as PrismaService), prisma };
  }

  // Lunes 2 de noviembre de 2026 (00:00 en Bogotá) a lunes 9: cubre 5 días hábiles completos.
  const semana = { sede: 'MOC', desde: '2026-11-02T05:00:00.000Z', hasta: '2026-11-09T05:00:00.000Z' };

  it('calcula horas de operación, ocupadas y porcentaje por espacio y en total', async () => {
    const e = crearEntorno();
    const r = await e.servicio.consultar(semana);

    expect(r.sede).toEqual({ codigo: 'MOC', nombre: 'Mocoa' });
    expect(r.bloque).toBeNull();
    expect(r.espacios).toEqual([
      { codigo: 'A-101', nombre: 'Aula 101', horasOperacion: 60, horasOcupadas: 30, porcentajeOcupacion: 50 },
      { codigo: 'A-102', nombre: 'Aula 102', horasOperacion: 0, horasOcupadas: 0, porcentajeOcupacion: 0 },
    ]);
    expect(r).toMatchObject({ horasOperacion: 60, horasOcupadas: 30, porcentajeOcupacion: 50 });
  });

  it('con bloque filtra por él y lo incluye en la respuesta', async () => {
    const e = crearEntorno();
    const r = await e.servicio.consultar({ ...semana, bloque: 'A' });

    expect(r.bloque).toEqual({ codigo: 'A', nombre: 'Bloque A' });
    const { where } = e.prisma.espacio.findMany.mock.calls[0]![0] as { where: { bloque: unknown } };
    expect(where.bloque).toEqual({ id: 'blq-1' });
  });

  it('limita el porcentaje a 100', async () => {
    const e = crearEntorno();
    e.prisma.$queryRaw.mockResolvedValue([{ espacioId: 'e1', horas: 500 }]);
    const r = await e.servicio.consultar(semana);
    expect(r.espacios[0]?.porcentajeOcupacion).toBe(100);
  });

  it('sede o bloque inexistentes dan 404', async () => {
    const e = crearEntorno();
    e.prisma.sede.findFirst.mockResolvedValue(null);
    await expect(rechazo(e.servicio.consultar(semana))).resolves.toMatchObject({ codigo: 'NO_ENCONTRADO' });

    const otro = crearEntorno();
    otro.prisma.bloque.findFirst.mockResolvedValue(null);
    await expect(rechazo(otro.servicio.consultar({ ...semana, bloque: 'Z' }))).resolves.toMatchObject({
      codigo: 'NO_ENCONTRADO',
    });
  });

  it.each([
    ['rango invertido', { desde: '2026-11-09T05:00:00.000Z', hasta: '2026-11-02T05:00:00.000Z' }],
    ['más de 31 días', { desde: '2026-11-01T05:00:00.000Z', hasta: '2026-12-15T05:00:00.000Z' }],
  ])('rechaza un %s con 400 RANGO_INVALIDO', async (_caso, rango) => {
    const e = crearEntorno();
    const error = await rechazo(e.servicio.consultar({ sede: 'MOC', ...rango }));
    expect(error).toMatchObject({ codigo: 'RANGO_INVALIDO', status: 400 });
    expect(e.prisma.sede.findFirst).not.toHaveBeenCalled();
  });
});

describe('ImportacionHorarioService.importar', () => {
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

  const csv = (filas: string) => Buffer.from(ENCABEZADO + filas, 'utf8');

  it('crea el bloqueo de clase con una franja por cada semana y registra la bitácora', async () => {
    const e = crearEntorno();
    const r = await e.servicio.importar(
      csv('A-101,LUN,07:00,09:00,2026-11-02,2026-11-16,Cálculo I\n'),
      admin,
      contexto,
    );

    expect(r).toEqual({ filasLeidas: 1, bloqueosCreados: 1, franjasCreadas: 3, conflictos: [], errores: [] });
    expect(e.tx.bloqueoCalendario.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        espacioId: 'e1',
        motivo: 'CLASE',
        origen: 'IMPORTACION_HORARIO',
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        descripcion: 'Cálculo I',
        creadoPorId: 'u-admin',
        inicio: new Date('2026-11-02T12:00:00.000Z'),
      }),
      select: { id: true },
    });
    const { data } = e.tx.franjaOcupada.createMany.mock.calls[0]![0] as {
      data: { inicio: Date; fin: Date; estado: string; origen: string }[];
    };
    expect(data.map((f) => f.inicio.toISOString())).toEqual([
      '2026-11-02T12:00:00.000Z',
      '2026-11-09T12:00:00.000Z',
      '2026-11-16T12:00:00.000Z',
    ]);
    expect(data.every((f) => f.estado === 'BLOQUEO' && f.origen === 'CLASE')).toBe(true);
    expect(e.prisma.bitacora.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accion: 'HORARIO_IMPORTADO',
        datosDespues: expect.objectContaining({ bloqueosCreados: 1, franjasCreadas: 3 }),
      }),
    });
  });

  it('una ocurrencia que choca con una reserva se omite y se reporta, y el resto se importa', async () => {
    const e = crearEntorno();
    e.prisma.franjaOcupada.findMany.mockResolvedValue([
      {
        inicio: new Date('2026-11-09T11:00:00.000Z'),
        fin: new Date('2026-11-09T14:00:00.000Z'),
        estado: 'CONFIRMADA',
        origen: 'RESERVA',
      },
    ]);
    const r = await e.servicio.importar(csv('A-101,LUN,07:00,09:00,2026-11-02,2026-11-16,\n'), admin, contexto);

    expect(r.franjasCreadas).toBe(2);
    expect(r.conflictos).toEqual([
      {
        fila: 2,
        espacio: 'A-101',
        inicio: '2026-11-09T12:00:00.000Z',
        fin: '2026-11-09T14:00:00.000Z',
        motivo: 'Choca con una reserva confirmada.',
      },
    ]);
  });

  it('si toda la fila choca no crea el bloqueo', async () => {
    const e = crearEntorno();
    e.prisma.franjaOcupada.findMany.mockResolvedValue([
      {
        inicio: new Date('2026-11-01T00:00:00.000Z'),
        fin: new Date('2026-12-01T00:00:00.000Z'),
        estado: 'BLOQUEO',
        origen: 'MANTENIMIENTO',
      },
    ]);
    const r = await e.servicio.importar(csv('A-101,LUN,07:00,09:00,2026-11-02,2026-11-09,\n'), admin, contexto);

    expect(r.bloqueosCreados).toBe(0);
    expect(r.conflictos).toHaveLength(2);
    expect(e.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('las filas inválidas se reportan con su línea y no detienen a las demás', async () => {
    const e = crearEntorno();
    const r = await e.servicio.importar(
      csv(
        [
          'Z-999,LUN,07:00,09:00,2026-11-02,2026-11-09,',
          'A-101,XYZ,07:00,09:00,2026-11-02,2026-11-09,',
          'A-101,LUN,9am,11:00,2026-11-02,2026-11-09,',
          'A-101,LUN,09:00,07:00,2026-11-02,2026-11-09,',
          'A-101,LUN,07:00,09:00,2026-11-09,2026-11-02,',
          'A-101,MAR,07:00,09:00,2026-11-02,2026-11-02,',
          'A-101,Miércoles,07:00,09:00,2026-11-04,2026-11-04,',
        ].join('\n') + '\n',
      ),
      admin,
      contexto,
    );

    expect(r.errores.map((x) => x.fila)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(r.errores[0]?.mensaje).toContain('Z-999');
    expect(r.bloqueosCreados).toBe(1);
    expect(r.filasLeidas).toBe(7);
  });

  it('acepta encabezados con guion bajo y punto y coma', async () => {
    const e = crearEntorno();
    const r = await e.servicio.importar(
      Buffer.from('espacio;dia;hora_inicio;hora_fin;desde;hasta\nA-101;vie;14:00;16:00;2026-11-06;2026-11-06\n'),
      admin,
      contexto,
    );
    expect(r).toMatchObject({ bloqueosCreados: 1, franjasCreadas: 1 });
  });

  it('una carrera 23P01 en la transacción se reporta como conflicto', async () => {
    const e = crearEntorno();
    e.prisma.$transaction.mockRejectedValueOnce(Object.assign(new Error('exclusion'), { code: '23P01' }));
    const r = await e.servicio.importar(csv('A-101,LUN,07:00,09:00,2026-11-02,2026-11-02,\n'), admin, contexto);
    expect(r.bloqueosCreados).toBe(0);
    expect(r.conflictos).toHaveLength(1);
  });

  it.each([
    ['sin archivo', undefined, 'ARCHIVO_REQUERIDO'],
    ['vacío', Buffer.alloc(0), 'ARCHIVO_REQUERIDO'],
    ['sin las columnas obligatorias', Buffer.from('espacio,dia\nA-101,LUN\n'), 'CSV_INVALIDO'],
    ['sin filas de datos', Buffer.from(ENCABEZADO), 'CSV_INVALIDO'],
  ])('un archivo %s da 422 %s', async (_caso, contenido, codigo) => {
    const e = crearEntorno();
    const error = await rechazo(e.servicio.importar(contenido, admin, contexto));
    expect(error).toMatchObject({ codigo, status: 422 });
  });
});
