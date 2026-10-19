import { describe, expect, it, vi } from 'vitest';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { CrearBloqueoDto } from '../dto/crear-bloqueo.dto.js';
import { BloqueosService, expandirOcurrencias, MAXIMO_OCURRENCIAS } from './bloqueos.service.js';

const ESPACIO_ID = '8a3b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';
const DEPENDENCIA_ID = '11111111-2222-4333-8444-555555555555';
const BLOQUEO_ID = '5c1d8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';
const CONTEXTO = { ip: '10.0.0.1', userAgent: 'vitest', correlacionId: 'corr-1' };

const admin: UsuarioAutenticado = {
  id: 'u-admin',
  correo: 'admin@itp.edu.co',
  roles: ['ADMINISTRADOR'],
  dependencias: [],
  correoVerificado: true,
  esInstitucional: true,
};

const responsable: UsuarioAutenticado = {
  ...admin,
  id: 'u-resp',
  roles: ['RESPONSABLE_ESPACIO'],
  dependencias: [DEPENDENCIA_ID],
};

const datos = (cambios: Partial<CrearBloqueoDto> = {}): CrearBloqueoDto => ({
  espacioId: ESPACIO_ID,
  motivo: 'MANTENIMIENTO',
  inicio: '2026-11-03T13:00:00.000Z',
  fin: '2026-11-03T15:00:00.000Z',
  ...cambios,
});

function crearEntorno(opciones: { espacio?: unknown; choques?: unknown[] } = {}) {
  const tx = {
    bloqueoCalendario: { create: vi.fn().mockResolvedValue({ id: BLOQUEO_ID }) },
    franjaOcupada: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    bitacora: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    espacio: {
      findFirst: vi.fn().mockResolvedValue(
        opciones.espacio === undefined
          ? { id: ESPACIO_ID, dependenciaId: DEPENDENCIA_ID, responsableId: null }
          : opciones.espacio,
      ),
    },
    franjaOcupada: { findMany: vi.fn().mockResolvedValue(opciones.choques ?? []) },
    $transaction: vi.fn((fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { servicio: new BloqueosService(prisma as unknown as PrismaService), prisma, tx };
}

const rechazo = (promesa: Promise<unknown>): Promise<unknown> => promesa.catch((e: unknown) => e);

describe('expandirOcurrencias', () => {
  const inicio = new Date('2026-11-02T13:00:00.000Z');
  const fin = new Date('2026-11-02T15:00:00.000Z');

  it('sin rrule devuelve una sola ocurrencia', () => {
    expect(expandirOcurrencias({ inicio, fin })).toEqual([{ inicio, fin }]);
  });

  it('expande una regla semanal conservando la duración', () => {
    const ocurrencias = expandirOcurrencias({
      inicio,
      fin,
      rrule: 'FREQ=WEEKLY;BYDAY=MO,WE',
      repetirHasta: new Date('2026-11-16T23:59:00.000Z'),
    });
    expect(ocurrencias.map((o) => o.inicio.toISOString())).toEqual([
      '2026-11-02T13:00:00.000Z',
      '2026-11-04T13:00:00.000Z',
      '2026-11-09T13:00:00.000Z',
      '2026-11-11T13:00:00.000Z',
      '2026-11-16T13:00:00.000Z',
    ]);
    for (const o of ocurrencias) expect(o.fin.getTime() - o.inicio.getTime()).toBe(2 * 3_600_000);
  });

  it('exige repetirHasta con rrule', () => {
    expect(() => expandirOcurrencias({ inicio, fin, rrule: 'FREQ=DAILY' })).toThrow(
      expect.objectContaining({ codigo: 'BLOQUEO_INVALIDO' }),
    );
  });

  it('rechaza una regla inválida', () => {
    expect(() =>
      expandirOcurrencias({ inicio, fin, rrule: 'esto-no-es-rrule', repetirHasta: new Date('2026-12-01') }),
    ).toThrow(expect.objectContaining({ codigo: 'BLOQUEO_INVALIDO' }));
  });

  it('corta una regla que generaría millones de fechas sin bloquear el proceso', () => {
    const t0 = Date.now();
    expect(() =>
      expandirOcurrencias({
        inicio,
        fin,
        rrule: 'FREQ=SECONDLY',
        repetirHasta: new Date(inicio.getTime() + 3 * 86_400_000),
      }),
    ).toThrow(expect.objectContaining({ codigo: 'BLOQUEO_INVALIDO' }));
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('evalúa BYDAY en el día de Bogotá, no en el de UTC (lunes 22:00 local = martes 03:00 UTC)', () => {
    const ocurrencias = expandirOcurrencias({
      inicio: new Date('2026-11-03T03:00:00.000Z'),
      fin: new Date('2026-11-03T05:00:00.000Z'),
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      repetirHasta: new Date('2026-11-20T00:00:00.000Z'),
    });
    expect(ocurrencias.map((o) => o.inicio.toISOString())).toEqual([
      '2026-11-03T03:00:00.000Z',
      '2026-11-10T03:00:00.000Z',
      '2026-11-17T03:00:00.000Z',
    ]);
  });

  it('rechaza repeticiones que se cruzan entre sí', () => {
    expect(() =>
      expandirOcurrencias({
        inicio,
        fin: new Date(inicio.getTime() + 4 * 3_600_000),
        rrule: 'FREQ=HOURLY;INTERVAL=2',
        repetirHasta: new Date(inicio.getTime() + 86_400_000),
      }),
    ).toThrow(expect.objectContaining({ codigo: 'BLOQUEO_INVALIDO', message: expect.stringContaining('cruzan') }));
  });

  it('acepta repeticiones contiguas (una termina cuando empieza la siguiente)', () => {
    const ocurrencias = expandirOcurrencias({
      inicio,
      fin: new Date(inicio.getTime() + 2 * 3_600_000),
      rrule: 'FREQ=HOURLY;INTERVAL=2',
      repetirHasta: new Date(inicio.getTime() + 6 * 3_600_000),
    });
    expect(ocurrencias).toHaveLength(4);
  });

  it(`rechaza más de ${MAXIMO_OCURRENCIAS} ocurrencias`, () => {
    expect(() =>
      expandirOcurrencias({ inicio, fin, rrule: 'FREQ=DAILY', repetirHasta: new Date('2028-01-01') }),
    ).toThrow(expect.objectContaining({ codigo: 'BLOQUEO_INVALIDO' }));
  });
});

describe('BloqueosService.crear', () => {
  it('crea el bloqueo, las franjas BLOQUEO y la bitácora en una transacción', async () => {
    const e = crearEntorno();
    const resultado = await e.servicio.crear(
      datos({
        rrule: 'FREQ=WEEKLY',
        repetirHasta: '2026-11-17T23:59:00.000Z',
        etiquetaPublica: 'Mantenimiento',
      }),
      admin,
      CONTEXTO,
    );

    expect(e.prisma.$transaction).toHaveBeenCalledOnce();
    expect(resultado).toEqual({
      id: BLOQUEO_ID,
      espacioId: ESPACIO_ID,
      motivo: 'MANTENIMIENTO',
      franjasCreadas: 3,
      inicio: '2026-11-03T13:00:00.000Z',
      fin: '2026-11-17T15:00:00.000Z',
    });
    const { data } = e.tx.franjaOcupada.createMany.mock.calls[0]![0] as {
      data: { estado: string; origen: string; bloqueoId: string; etiquetaPublica: string }[];
    };
    expect(data).toHaveLength(3);
    expect(data.every((f) => f.estado === 'BLOQUEO' && f.origen === 'MANTENIMIENTO')).toBe(true);
    expect(data.every((f) => f.bloqueoId === BLOQUEO_ID && f.etiquetaPublica === 'Mantenimiento')).toBe(true);
    expect(e.tx.bitacora.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accion: 'BLOQUEO_CREADO',
        entidad: 'BloqueoCalendario',
        entidadId: BLOQUEO_ID,
        usuarioId: 'u-admin',
        correlacionId: 'corr-1',
      }),
    });
  });

  it('un choque con otra ocupación responde 409 con los conflictos y no escribe', async () => {
    const choque = { inicio: new Date('2026-11-03T14:00:00.000Z'), fin: new Date('2026-11-03T16:00:00.000Z') };
    const e = crearEntorno({ choques: [choque] });
    const error = await rechazo(e.servicio.crear(datos(), admin, CONTEXTO));

    expect(error).toMatchObject({
      codigo: 'FRANJA_NO_DISPONIBLE',
      status: 409,
      detalles: { conflictos: [{ inicio: '2026-11-03T14:00:00.000Z', fin: '2026-11-03T16:00:00.000Z' }] },
    });
    expect(e.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('un 23P01 en la transacción (carrera) también responde 409', async () => {
    const e = crearEntorno();
    e.prisma.$transaction.mockRejectedValueOnce(
      Object.assign(new Error('conflicting key value violates exclusion constraint'), { code: '23P01' }),
    );
    const error = await rechazo(e.servicio.crear(datos(), admin, CONTEXTO));
    expect(error).toMatchObject({ codigo: 'FRANJA_NO_DISPONIBLE', status: 409 });
  });

  it('un error distinto se propaga', async () => {
    const e = crearEntorno();
    e.prisma.$transaction.mockRejectedValueOnce(new Error('conexión perdida'));
    await expect(e.servicio.crear(datos(), admin, CONTEXTO)).rejects.toThrow('conexión perdida');
  });

  it.each([
    ['motivo RESERVA', { motivo: 'RESERVA' as const }],
    ['fin anterior al inicio', { fin: '2026-11-03T12:00:00.000Z' }],
    ['ocurrencia de más de 24 horas', { fin: '2026-11-04T14:00:00.000Z' }],
  ])('rechaza %s con 400 BLOQUEO_INVALIDO', async (_caso, cambios) => {
    const e = crearEntorno();
    const error = await rechazo(e.servicio.crear(datos(cambios), admin, CONTEXTO));
    expect(error).toMatchObject({ codigo: 'BLOQUEO_INVALIDO', status: 400 });
    expect(e.prisma.espacio.findFirst).not.toHaveBeenCalled();
  });

  it('unas fechas que no se pueden interpretar dan 400 y no llegan a la base de datos', async () => {
    const e = crearEntorno();
    const error = await rechazo(
      e.servicio.crear(datos({ inicio: 'no-es-una-fecha' }), admin, CONTEXTO),
    );
    expect(error).toMatchObject({ codigo: 'BLOQUEO_INVALIDO', status: 400 });
    expect(e.prisma.espacio.findFirst).not.toHaveBeenCalled();
  });

  it('un espacio inexistente da 404', async () => {
    const e = crearEntorno({ espacio: null });
    const error = await rechazo(e.servicio.crear(datos(), admin, CONTEXTO));
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
  });

  it('el responsable bloquea espacios de su dependencia', async () => {
    const e = crearEntorno();
    await expect(e.servicio.crear(datos(), responsable, CONTEXTO)).resolves.toMatchObject({ id: BLOQUEO_ID });
  });

  it('el responsable bloquea un espacio a su cargo aunque no sea de su dependencia', async () => {
    const e = crearEntorno({ espacio: { id: ESPACIO_ID, dependenciaId: 'otra', responsableId: 'u-resp' } });
    await expect(e.servicio.crear(datos(), responsable, CONTEXTO)).resolves.toMatchObject({ id: BLOQUEO_ID });
  });

  it('el responsable no bloquea un espacio ajeno: 404', async () => {
    const e = crearEntorno({ espacio: { id: ESPACIO_ID, dependenciaId: 'otra', responsableId: null } });
    const error = await rechazo(e.servicio.crear(datos(), responsable, CONTEXTO));
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
    expect(e.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('BloqueosService.anular', () => {
  function crearAnulacion(bloqueo: unknown = {
    id: BLOQUEO_ID,
    anuladoEn: null,
    espacioId: ESPACIO_ID,
    espacio: { dependenciaId: DEPENDENCIA_ID, responsableId: null },
  }) {
    const tx = {
      bloqueoCalendario: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      franjaOcupada: { updateMany: vi.fn().mockResolvedValue({ count: 12 }) },
      bitacora: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      bloqueoCalendario: { findUnique: vi.fn().mockResolvedValue(bloqueo) },
      $transaction: vi.fn((fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    return { servicio: new BloqueosService(prisma as unknown as PrismaService), prisma, tx };
  }

  it('marca la anulación, libera solo las franjas futuras y deja bitácora', async () => {
    const e = crearAnulacion();
    const r = await e.servicio.anular(BLOQUEO_ID, { motivo: ' Se reprogramó. ' }, admin, CONTEXTO);

    expect(r).toMatchObject({ id: BLOQUEO_ID, franjasLiberadas: 12 });
    expect(e.tx.bloqueoCalendario.updateMany).toHaveBeenCalledWith({
      where: { id: BLOQUEO_ID, anuladoEn: null },
      data: { anuladoEn: expect.any(Date) },
    });
    expect(e.tx.franjaOcupada.updateMany).toHaveBeenCalledWith({
      where: { bloqueoId: BLOQUEO_ID, estado: 'BLOQUEO', fin: { gt: expect.any(Date) } },
      data: { estado: 'LIBERADA' },
    });
    expect(e.tx.bitacora.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accion: 'BLOQUEO_ANULADO',
        entidadId: BLOQUEO_ID,
        datosDespues: { espacioId: ESPACIO_ID, motivo: 'Se reprogramó.', franjasLiberadas: 12 },
      }),
    });
  });

  it('un bloqueo ya anulado responde 409', async () => {
    const e = crearAnulacion({
      id: BLOQUEO_ID,
      anuladoEn: new Date(),
      espacioId: ESPACIO_ID,
      espacio: { dependenciaId: DEPENDENCIA_ID, responsableId: null },
    });
    await expect(e.servicio.anular(BLOQUEO_ID, { motivo: 'x' }, admin, CONTEXTO)).rejects.toMatchObject({
      codigo: 'BLOQUEO_YA_ANULADO',
      status: 409,
    });
    expect(e.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('si otra persona lo anuló a la vez no libera nada', async () => {
    const e = crearAnulacion();
    e.tx.bloqueoCalendario.updateMany.mockResolvedValue({ count: 0 });
    await expect(e.servicio.anular(BLOQUEO_ID, { motivo: 'x' }, admin, CONTEXTO)).rejects.toMatchObject({
      codigo: 'BLOQUEO_YA_ANULADO',
    });
    expect(e.tx.franjaOcupada.updateMany).not.toHaveBeenCalled();
  });

  it('el responsable anula los de su dependencia; uno ajeno o inexistente da 404', async () => {
    const propio = crearAnulacion();
    await expect(propio.servicio.anular(BLOQUEO_ID, { motivo: 'x' }, responsable, CONTEXTO)).resolves.toMatchObject({
      franjasLiberadas: 12,
    });

    const ajeno = crearAnulacion({
      id: BLOQUEO_ID,
      anuladoEn: null,
      espacioId: ESPACIO_ID,
      espacio: { dependenciaId: 'otra', responsableId: null },
    });
    await expect(ajeno.servicio.anular(BLOQUEO_ID, { motivo: 'x' }, responsable, CONTEXTO)).rejects.toMatchObject({
      codigo: 'NO_ENCONTRADO',
      status: 404,
    });

    const inexistente = crearAnulacion(null);
    await expect(inexistente.servicio.anular(BLOQUEO_ID, { motivo: 'x' }, admin, CONTEXTO)).rejects.toMatchObject({
      status: 404,
    });
  });
});
