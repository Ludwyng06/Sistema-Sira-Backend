import { describe, expect, it, vi } from 'vitest';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { SolicitudesService } from './solicitudes.service.js';

const SOLICITANTE = { id: 'sol-1', tipo: 'INTERNO', dependenciaId: 'dep-1' };
const SOLICITUD_ID = '6e1d8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';

const usuario = (cambios: Partial<UsuarioAutenticado> = {}): UsuarioAutenticado => ({
  id: 'u-1',
  correo: 'ana@itp.edu.co',
  roles: ['SOLICITANTE'],
  dependencias: [],
  correoVerificado: true,
  esInstitucional: true,
  ...cambios,
});

const fila = (cambios: Record<string, unknown> = {}) => ({
  id: SOLICITUD_ID,
  consecutivo: null,
  solicitanteId: 'sol-1',
  dependenciaId: 'dep-1',
  objetoEvento: 'Congreso',
  descripcion: null,
  asistentesEstimados: 120,
  responsableEnSitio: null,
  telefonoContacto: null,
  eventoPublico: false,
  declaraUsoInstitucional: false,
  esExenta: false,
  tipoTarifa: 'INTERNO',
  estado: 'BORRADOR',
  enviadaEn: null,
  venceEn: null,
  creadoEn: new Date('2026-10-21T15:00:00.000Z'),
  actualizadoEn: new Date('2026-10-21T15:00:00.000Z'),
  ...cambios,
});

function crearEntorno(opciones: { solicitante?: unknown } = {}) {
  const tx = {
    solicitud: { create: vi.fn().mockResolvedValue(fila()) },
    historialEstadoSolicitud: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    solicitante: {
      findUnique: vi
        .fn()
        .mockResolvedValue(opciones.solicitante === undefined ? SOLICITANTE : opciones.solicitante),
    },
    solicitud: {
      findFirst: vi.fn().mockResolvedValue(fila()),
      findUnique: vi.fn().mockResolvedValue(fila({ solicitanteId: 'otro' })),
      findMany: vi.fn().mockResolvedValue([fila()]),
      count: vi.fn().mockResolvedValue(1),
      update: vi.fn().mockResolvedValue(fila({ objetoEvento: 'Nuevo' })),
    },
    $transaction: vi.fn((fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { servicio: new SolicitudesService(prisma as unknown as PrismaService), prisma, tx };
}

const rechazo = (promesa: Promise<unknown>): Promise<unknown> => promesa.catch((e: unknown) => e);
const datos = { objetoEvento: ' Congreso ', asistentesEstimados: 120 };

describe('SolicitudesService.crear', () => {
  it('crea el borrador con tarifa y dependencia del perfil y escribe el historial', async () => {
    const e = crearEntorno();
    const resultado = await e.servicio.crear(datos, usuario());

    expect(e.tx.solicitud.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        solicitanteId: 'sol-1',
        dependenciaId: 'dep-1',
        tipoTarifa: 'INTERNO',
        objetoEvento: 'Congreso',
        eventoPublico: false,
        declaraUsoInstitucional: false,
      }),
    });
    const { data } = e.tx.solicitud.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(data).not.toHaveProperty('esExenta');
    expect(data).not.toHaveProperty('estado');
    expect(e.tx.historialEstadoSolicitud.create).toHaveBeenCalledWith({
      data: { solicitudId: SOLICITUD_ID, estadoAnterior: null, estadoNuevo: 'BORRADOR', usuarioId: 'u-1' },
    });
    expect(resultado).toMatchObject({ id: SOLICITUD_ID, estado: 'BORRADOR', consecutivo: null, esExenta: false });
  });

  it('sin perfil de solicitante responde 422 PERFIL_INCOMPLETO', async () => {
    const e = crearEntorno({ solicitante: null });
    const error = await rechazo(e.servicio.crear(datos, usuario()));
    expect(error).toMatchObject({ codigo: 'PERFIL_INCOMPLETO', status: 422 });
  });

  it('una cuenta externa no puede declarar uso institucional', async () => {
    const e = crearEntorno();
    const error = await rechazo(
      e.servicio.crear({ ...datos, declaraUsoInstitucional: true }, usuario({ esInstitucional: false })),
    );
    expect(error).toMatchObject({ codigo: 'USO_INSTITUCIONAL_NO_PERMITIDO', status: 422 });
    expect(e.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('SolicitudesService.obtener', () => {
  const detalle = (cambios: Record<string, unknown> = {}) =>
    fila({
      reservas: [
        {
          id: 'r-1',
          espacioId: 'esp-1',
          inicio: new Date('2026-11-03T13:00:00.000Z'),
          fin: new Date('2026-11-03T17:00:00.000Z'),
          unidad: 'HORA',
          cantidad: { toString: () => '4' },
          valorUnitario: 20_000,
          recargos: 0,
          subtotal: 80_000,
        },
      ],
      servicios: [
        {
          id: 's-1',
          servicioId: 'srv-1',
          servicio: { nombre: 'Sonido' },
          cantidad: 1,
          valorUnitario: 50_000,
          subtotal: 50_000,
          estadoConfirmacion: 'PENDIENTE',
          observaciones: null,
        },
      ],
      decisiones: [
        {
          tipo: 'AVAL',
          resultado: 'APROBADA',
          motivo: null,
          decididaEn: new Date('2026-10-22T10:00:00.000Z'),
        },
      ],
      cotizaciones: [
        {
          consecutivo: 'COT-2026-0001',
          subtotal: 130_000,
          iva: 0,
          total: 130_000,
          depositoGarantia: 0,
          valorReferencia: 0,
          validaHasta: new Date('2026-10-24T15:00:00.000Z'),
        },
      ],
      ...cambios,
    });

  it('el dueño la ve con reservas, servicios, decisiones y cotización', async () => {
    const e = crearEntorno();
    e.prisma.solicitud.findFirst.mockResolvedValue(detalle());
    const r = await e.servicio.obtener(SOLICITUD_ID, usuario());

    const { where } = e.prisma.solicitud.findFirst.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(where).toEqual({ id: SOLICITUD_ID, OR: [{ solicitanteId: 'sol-1' }] });
    expect(r.reservas).toEqual([
      expect.objectContaining({ id: 'r-1', cantidad: 4, subtotal: 80_000, inicio: '2026-11-03T13:00:00.000Z' }),
    ]);
    expect(r.servicios).toEqual([expect.objectContaining({ nombre: 'Sonido', subtotal: 50_000 })]);
    expect(r.decisiones).toEqual([
      { tipo: 'AVAL', resultado: 'APROBADA', motivo: null, decididaEn: '2026-10-22T10:00:00.000Z' },
    ]);
    expect(r.cotizacion).toMatchObject({ consecutivo: 'COT-2026-0001', total: 130_000 });
  });

  it('sin cotización devuelve null', async () => {
    const e = crearEntorno();
    e.prisma.solicitud.findFirst.mockResolvedValue(detalle({ cotizaciones: [] }));
    await expect(e.servicio.obtener(SOLICITUD_ID, usuario())).resolves.toMatchObject({ cotizacion: null });
  });

  it('una solicitud fuera de alcance responde 404', async () => {
    const e = crearEntorno();
    e.prisma.solicitud.findFirst.mockResolvedValue(null);
    const error = await rechazo(e.servicio.obtener(SOLICITUD_ID, usuario()));
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
  });

  it('un responsable ve las solicitudes enviadas de sus espacios, nunca borradores', async () => {
    const e = crearEntorno({ solicitante: null });
    e.prisma.solicitud.findFirst.mockResolvedValue(detalle());
    await e.servicio.obtener(SOLICITUD_ID, usuario({ id: 'u-resp', roles: ['RESPONSABLE_ESPACIO'] }));

    const { where } = e.prisma.solicitud.findFirst.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(where).toEqual({
      id: SOLICITUD_ID,
      OR: [
        {
          AND: [
            { estado: { not: 'BORRADOR' } },
            { OR: [{ reservas: { some: { espacio: { responsableId: 'u-resp' } } } }] },
          ],
        },
      ],
    });
  });

  it('un aprobador ve las de las dependencias de su alcance', async () => {
    const e = crearEntorno({ solicitante: null });
    e.prisma.solicitud.findFirst.mockResolvedValue(detalle());
    await e.servicio.obtener(SOLICITUD_ID, usuario({ roles: ['APROBADOR'], dependencias: ['dep-9'] }));

    const { where } = e.prisma.solicitud.findFirst.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(JSON.stringify(where)).toContain('"dependenciaId":{"in":["dep-9"]}');
  });

  it.each(['TESORERIA', 'AUDITOR', 'ADMINISTRADOR'] as const)('%s ve todo menos los borradores', async (rol) => {
    const e = crearEntorno({ solicitante: null });
    e.prisma.solicitud.findFirst.mockResolvedValue(detalle());
    await e.servicio.obtener(SOLICITUD_ID, usuario({ roles: [rol] }));

    const { where } = e.prisma.solicitud.findFirst.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(where).toEqual({ id: SOLICITUD_ID, OR: [{ estado: { not: 'BORRADOR' } }] });
  });

  it('un usuario sin perfil ni rol de revisión recibe 404 sin consultar', async () => {
    const e = crearEntorno({ solicitante: null });
    const error = await rechazo(e.servicio.obtener(SOLICITUD_ID, usuario({ roles: ['SOLICITANTE'] })));
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
    expect(e.prisma.solicitud.findFirst).not.toHaveBeenCalled();
  });
});

describe('SolicitudesService.asegurarVisible', () => {
  it('no falla si la solicitud es del usuario', async () => {
    const e = crearEntorno();
    await expect(e.servicio.asegurarVisible(SOLICITUD_ID, usuario())).resolves.toBeUndefined();
    expect(e.prisma.solicitud.findFirst).toHaveBeenCalledWith({
      where: { id: SOLICITUD_ID, OR: [{ solicitanteId: 'sol-1' }] },
      select: { id: true },
    });
  });

  it('responde 404 si está fuera de alcance', async () => {
    const e = crearEntorno();
    e.prisma.solicitud.findFirst.mockResolvedValue(null);
    const error = await rechazo(e.servicio.asegurarVisible(SOLICITUD_ID, usuario()));
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
  });

  it('responde 404 sin consultar si el usuario no tiene perfil ni bandeja', async () => {
    const e = crearEntorno({ solicitante: null });
    const error = await rechazo(e.servicio.asegurarVisible(SOLICITUD_ID, usuario()));
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
    expect(e.prisma.solicitud.findFirst).not.toHaveBeenCalled();
  });
});

describe('SolicitudesService.listar', () => {
  const filtros = (cambios: Record<string, unknown> = {}) => ({
    ambito: 'PROPIAS' as const,
    pagina: 1,
    porPagina: 20,
    ...cambios,
  });

  it('pagina solo las propias y filtra por estado', async () => {
    const e = crearEntorno();
    const pagina = await e.servicio.listar(filtros({ pagina: 2, porPagina: 10, estado: 'BORRADOR' }), usuario());

    expect(e.prisma.solicitud.findMany).toHaveBeenCalledWith({
      where: { solicitanteId: 'sol-1', estado: 'BORRADOR' },
      orderBy: { creadoEn: 'desc' },
      skip: 10,
      take: 10,
    });
    expect(pagina).toMatchObject({ total: 1, pagina: 2, porPagina: 10 });
    expect(pagina.datos).toHaveLength(1);
  });

  it('la bandeja del aprobador lista lo enviado de su alcance', async () => {
    const e = crearEntorno({ solicitante: null });
    await e.servicio.listar(
      filtros({ ambito: 'BANDEJA', estado: 'EN_REVISION' }),
      usuario({ roles: ['APROBADOR'], dependencias: ['dep-9'] }),
    );

    const { where } = e.prisma.solicitud.findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(where).toMatchObject({ estado: 'EN_REVISION' });
    expect(JSON.stringify(where)).toContain('"dependenciaId":{"in":["dep-9"]}');
  });

  it('un rol sin bandeja recibe 403 SIN_BANDEJA', async () => {
    const e = crearEntorno();
    const error = await rechazo(e.servicio.listar(filtros({ ambito: 'BANDEJA' }), usuario()));
    expect(error).toMatchObject({ codigo: 'SIN_BANDEJA', status: 403 });
  });
});

describe('SolicitudesService.actualizar', () => {
  it('actualiza solo los campos enviados', async () => {
    const e = crearEntorno();
    await e.servicio.actualizar(SOLICITUD_ID, { objetoEvento: ' Nuevo ' }, usuario());
    expect(e.prisma.solicitud.update).toHaveBeenCalledWith({
      where: { id: SOLICITUD_ID },
      data: { objetoEvento: 'Nuevo' },
    });
  });

  it('una solicitud ajena responde 404', async () => {
    const e = crearEntorno();
    e.prisma.solicitud.findFirst.mockResolvedValue(null);
    const error = await rechazo(e.servicio.actualizar(SOLICITUD_ID, { eventoPublico: true }, usuario()));
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
  });

  it('fuera de BORRADOR responde 409 SOLICITUD_NO_EDITABLE', async () => {
    const e = crearEntorno();
    e.prisma.solicitud.findFirst.mockResolvedValue(fila({ estado: 'ENVIADA' }));
    const error = await rechazo(e.servicio.actualizar(SOLICITUD_ID, { eventoPublico: true }, usuario()));
    expect(error).toMatchObject({ codigo: 'SOLICITUD_NO_EDITABLE', status: 409 });
    expect(e.prisma.solicitud.update).not.toHaveBeenCalled();
  });
});
