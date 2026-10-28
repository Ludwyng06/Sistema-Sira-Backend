import { describe, expect, it, vi } from 'vitest';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import type { ConsecutivoService } from '../../../shared/consecutivos/consecutivo.service.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { NotificacionesService } from '../../notificaciones/services/notificaciones.service.js';
import type { CrearActaDto } from '../dto/acta.dto.js';
import { ActasService } from './actas.service.js';

const SOLICITUD_ID = '6e1d8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';
const VIDEOBEAM = '11111111-2222-4333-8444-555555555551';
const SILLAS = '11111111-2222-4333-8444-555555555552';
const CONTEXTO = { ip: '10.0.0.1', userAgent: 'vitest', correlacionId: 'corr-1' };

const responsable: UsuarioAutenticado = {
  id: 'u-resp',
  correo: 'resp@itp.edu.co',
  roles: ['RESPONSABLE_ESPACIO'],
  dependencias: [],
  correoVerificado: true,
  esInstitucional: true,
};

const solicitud = (cambios: Record<string, unknown> = {}) => ({
  id: SOLICITUD_ID,
  estado: 'CONFIRMADA',
  reservas: [{ id: 'r-1', espacioId: 'esp-1' }],
  actas: [] as { tipo: string }[],
  ...cambios,
});

const elementos = [
  { id: VIDEOBEAM, nombre: 'Videobeam', cantidad: 1 },
  { id: SILLAS, nombre: 'Sillas', cantidad: 40 },
];

function crearEntorno(fila: unknown = solicitud()) {
  const tx = {
    acta: {
      create: vi.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'acta-1', generadaEn: new Date('2026-11-03T13:00:00.000Z'), ...args.data }),
      ),
      count: vi.fn().mockResolvedValue(0),
    },
    novedad: {
      create: vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ id: 'nov-1', ...args.data })),
    },
    solicitud: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    historialEstadoSolicitud: { create: vi.fn().mockResolvedValue({}) },
    bitacora: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    solicitud: { findFirst: vi.fn().mockResolvedValue(fila) },
    elemento: { findMany: vi.fn().mockResolvedValue(elementos) },
    acta: { findFirst: vi.fn() },
    $transaction: vi.fn((fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const consecutivos = { siguiente: vi.fn().mockResolvedValue('ACT-2026-0001') };
  const notificaciones = { notificarSolicitante: vi.fn().mockResolvedValue(undefined) };
  const servicio = new ActasService(
    prisma as unknown as PrismaService,
    consecutivos as unknown as ConsecutivoService,
    notificaciones as unknown as NotificacionesService,
  );
  return { servicio, prisma, tx, consecutivos, notificaciones };
}

const entrega = (cambios: Partial<CrearActaDto> = {}): CrearActaDto => ({
  solicitudId: SOLICITUD_ID,
  tipo: 'ENTREGA',
  checklist: [
    { elementoId: VIDEOBEAM, cantidadEncontrada: 1, estadoFisico: 'BUENO' },
    { elementoId: SILLAS, cantidadEncontrada: 40, estadoFisico: 'REGULAR' },
  ],
  ...cambios,
});

const rechazo = (promesa: Promise<unknown>): Promise<unknown> => promesa.catch((e: unknown) => e);

describe('ActasService.crear', () => {
  it('la entrega arma el checklist desde los elementos, pasa a EN_USO y escribe historial y bitácora', async () => {
    const e = crearEntorno();
    const r = await e.servicio.crear(entrega({ observaciones: ' Todo completo. ' }), responsable, CONTEXTO);

    expect(e.consecutivos.siguiente).toHaveBeenCalledWith(expect.anything(), 'ACTA');
    expect(r).toMatchObject({
      consecutivo: 'ACT-2026-0001',
      tipo: 'ENTREGA',
      estadoSolicitud: 'EN_USO',
      observaciones: 'Todo completo.',
    });
    expect(r.checklist).toEqual([
      {
        elementoId: VIDEOBEAM,
        nombre: 'Videobeam',
        cantidadEsperada: 1,
        cantidadEncontrada: 1,
        estadoFisico: 'BUENO',
        ok: true,
      },
      {
        elementoId: SILLAS,
        nombre: 'Sillas',
        cantidadEsperada: 40,
        cantidadEncontrada: 40,
        estadoFisico: 'REGULAR',
        ok: true,
      },
    ]);
    expect(e.tx.solicitud.updateMany).toHaveBeenCalledWith({
      where: { id: SOLICITUD_ID, estado: 'CONFIRMADA' },
      data: { estado: 'EN_USO' },
    });
    expect(e.tx.historialEstadoSolicitud.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ estadoAnterior: 'CONFIRMADA', estadoNuevo: 'EN_USO' }),
    });
    expect(e.tx.bitacora.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ accion: 'ACTA_ENTREGA_REGISTRADA', correlacionId: 'corr-1' }),
    });
  });

  it('avisa al solicitante que se registró el acta', async () => {
    const e = crearEntorno();
    await e.servicio.crear(entrega(), responsable, CONTEXTO);
    expect(e.notificaciones.notificarSolicitante).toHaveBeenCalledWith(
      SOLICITUD_ID,
      expect.objectContaining({ cuerpo: expect.stringContaining('ACT-2026-0001') }),
    );
  });

  it('la devolución pasa a FINALIZADA y registra las novedades', async () => {
    const e = crearEntorno(solicitud({ estado: 'EN_USO', actas: [{ tipo: 'ENTREGA' }] }));
    const r = await e.servicio.crear(
      {
        solicitudId: SOLICITUD_ID,
        tipo: 'DEVOLUCION',
        checklist: [
          { elementoId: VIDEOBEAM, cantidadEncontrada: 1, estadoFisico: 'MALO' },
          { elementoId: SILLAS, cantidadEncontrada: 38, estadoFisico: 'BUENO' },
        ],
        novedades: [
          {
            elementoId: VIDEOBEAM,
            descripcion: 'Lente rayado.',
            valorDano: 150_000,
            tratamiento: 'DESCONTAR_DEPOSITO',
          },
          { elementoId: SILLAS, descripcion: 'Faltan dos sillas.', valorDano: 0, tratamiento: 'SIN_COBRO' },
        ],
      },
      responsable,
      CONTEXTO,
    );

    expect(r.estadoSolicitud).toBe('FINALIZADA');
    expect(r.checklist.map((c) => c.ok)).toEqual([false, false]);
    expect(r.novedades).toHaveLength(2);
    expect(e.tx.novedad.create).toHaveBeenCalledWith({
      data: {
        actaId: 'acta-1',
        elementoId: VIDEOBEAM,
        descripcion: 'Lente rayado.',
        valorDano: 150_000,
        tratamiento: 'DESCONTAR_DEPOSITO',
      },
    });
    expect(e.tx.bitacora.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accion: 'ACTA_DEVOLUCION_REGISTRADA',
        datosDespues: expect.objectContaining({ elementosConProblema: 2, novedades: 2, valorDanos: 150_000 }),
      }),
    });
  });

  it('una devolución con un elemento en mal estado y sin novedad da 422 NOVEDAD_REQUERIDA', async () => {
    const e = crearEntorno(solicitud({ estado: 'EN_USO' }));
    const error = await rechazo(
      e.servicio.crear(
        {
          solicitudId: SOLICITUD_ID,
          tipo: 'DEVOLUCION',
          checklist: [
            { elementoId: VIDEOBEAM, cantidadEncontrada: 0, estadoFisico: 'BUENO' },
            { elementoId: SILLAS, cantidadEncontrada: 40, estadoFisico: 'BUENO' },
          ],
        },
        responsable,
        CONTEXTO,
      ),
    );
    expect(error).toMatchObject({ codigo: 'NOVEDAD_REQUERIDA', status: 422 });
    expect(e.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('un checklist que no cubre todos los elementos da 422 CHECKLIST_INVALIDO', async () => {
    const e = crearEntorno();
    const error = await rechazo(
      e.servicio.crear(
        entrega({ checklist: [{ elementoId: VIDEOBEAM, cantidadEncontrada: 1, estadoFisico: 'BUENO' }] }),
        responsable,
        CONTEXTO,
      ),
    );
    expect(error).toMatchObject({
      codigo: 'CHECKLIST_INVALIDO',
      status: 422,
      detalles: { faltantes: [{ elementoId: SILLAS, nombre: 'Sillas' }] },
    });
  });

  it('un elemento ajeno o repetido da 422 CHECKLIST_INVALIDO', async () => {
    const ajeno = crearEntorno();
    const errorAjeno = await rechazo(
      ajeno.servicio.crear(
        entrega({
          checklist: [
            ...entrega().checklist,
            { elementoId: '99999999-2222-4333-8444-555555555555', cantidadEncontrada: 1, estadoFisico: 'BUENO' },
          ],
        }),
        responsable,
        CONTEXTO,
      ),
    );
    expect(errorAjeno).toMatchObject({ codigo: 'CHECKLIST_INVALIDO' });

    const repetido = crearEntorno();
    const errorRepetido = await rechazo(
      repetido.servicio.crear(
        entrega({ checklist: [...entrega().checklist, entrega().checklist[0]!] }),
        responsable,
        CONTEXTO,
      ),
    );
    expect(errorRepetido).toMatchObject({ codigo: 'CHECKLIST_INVALIDO' });
  });

  it('una novedad sobre un elemento ajeno da 422', async () => {
    const e = crearEntorno();
    const error = await rechazo(
      e.servicio.crear(
        entrega({
          novedades: [
            {
              elementoId: '99999999-2222-4333-8444-555555555555',
              descripcion: 'x',
              valorDano: 0,
              tratamiento: 'SIN_COBRO',
            },
          ],
        }),
        responsable,
        CONTEXTO,
      ),
    );
    expect(error).toMatchObject({ codigo: 'CHECKLIST_INVALIDO', status: 422 });
  });

  it('dos actas simultáneas del mismo tipo: la segunda recibe 409 ACTA_YA_REGISTRADA y no crea nada', async () => {
    const e = crearEntorno();
    e.tx.solicitud.updateMany.mockResolvedValue({ count: 0 });
    e.tx.acta.count.mockResolvedValue(1);
    const error = await rechazo(e.servicio.crear(entrega(), responsable, CONTEXTO));

    expect(error).toMatchObject({ codigo: 'ACTA_YA_REGISTRADA', status: 409 });
    expect(e.tx.acta.create).not.toHaveBeenCalled();
    expect(e.consecutivos.siguiente).not.toHaveBeenCalled();
  });

  it('si el estado cambió mientras se registraba (sin acta previa) responde 409 ACTA_NO_PERMITIDA', async () => {
    const e = crearEntorno();
    e.tx.solicitud.updateMany.mockResolvedValue({ count: 0 });
    const error = await rechazo(e.servicio.crear(entrega(), responsable, CONTEXTO));
    expect(error).toMatchObject({ codigo: 'ACTA_NO_PERMITIDA', status: 409 });
    expect(e.tx.acta.create).not.toHaveBeenCalled();
  });

  it('una acta repetida del mismo tipo da 409 ACTA_YA_REGISTRADA', async () => {
    const e = crearEntorno(solicitud({ actas: [{ tipo: 'ENTREGA' }] }));
    const error = await rechazo(e.servicio.crear(entrega(), responsable, CONTEXTO));
    expect(error).toMatchObject({ codigo: 'ACTA_YA_REGISTRADA', status: 409 });
  });

  it.each([
    ['entrega de una solicitud en uso', 'ENTREGA', 'EN_USO'],
    ['devolución de una solicitud solo confirmada', 'DEVOLUCION', 'CONFIRMADA'],
  ] as const)('%s da 409 ACTA_NO_PERMITIDA', async (_caso, tipo, estado) => {
    const e = crearEntorno(solicitud({ estado }));
    const error = await rechazo(e.servicio.crear(entrega({ tipo }), responsable, CONTEXTO));
    expect(error).toMatchObject({ codigo: 'ACTA_NO_PERMITIDA', status: 409 });
  });

  it('quien no es responsable de un espacio de la solicitud recibe 404', async () => {
    const e = crearEntorno(null);
    const error = await rechazo(e.servicio.crear(entrega(), responsable, CONTEXTO));
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
  });

  it('sin el rol de responsable recibe 404 aunque sea responsable de un espacio', async () => {
    const e = crearEntorno();
    const error = await rechazo(
      e.servicio.crear(entrega(), { ...responsable, roles: ['SOLICITANTE'] }, CONTEXTO),
    );
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
  });
});

describe('ActasService.obtener', () => {
  it('devuelve el acta con sus novedades y el estado de la solicitud', async () => {
    const e = crearEntorno();
    e.prisma.acta.findFirst.mockResolvedValue({
      id: 'acta-1',
      consecutivo: 'ACT-2026-0001',
      solicitudId: SOLICITUD_ID,
      tipo: 'ENTREGA',
      checklist: [{ elementoId: VIDEOBEAM, nombre: 'Videobeam', ok: true }],
      observaciones: null,
      generadaEn: new Date('2026-11-03T13:00:00.000Z'),
      solicitud: { estado: 'EN_USO' },
      novedades: [{ id: 'n-1', elementoId: null, descripcion: 'x', valorDano: 0, tratamiento: 'SIN_COBRO' }],
    });
    const r = await e.servicio.obtener('acta-1', responsable);

    expect(r).toMatchObject({ consecutivo: 'ACT-2026-0001', estadoSolicitud: 'EN_USO' });
    expect(r.novedades).toHaveLength(1);
    const { where } = e.prisma.acta.findFirst.mock.calls[0]![0] as { where: { solicitud: { OR: unknown[] } } };
    expect(where.solicitud.OR).toEqual([
      { solicitante: { usuarioId: 'u-resp' } },
      { reservas: { some: { espacio: { responsableId: 'u-resp' } } } },
    ]);
  });

  it('administración y auditoría ven cualquier acta; otros reciben 404', async () => {
    const e = crearEntorno();
    e.prisma.acta.findFirst.mockResolvedValue(null);
    await rechazo(e.servicio.obtener('acta-1', { ...responsable, roles: ['AUDITOR'] }));
    const { where } = e.prisma.acta.findFirst.mock.calls[0]![0] as { where: { solicitud: { OR: unknown[] } } };
    expect(where.solicitud.OR).toContainEqual({});

    const error = await rechazo(e.servicio.obtener('acta-1', responsable));
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
  });
});
