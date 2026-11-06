import { describe, expect, it, vi } from 'vitest';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { TarifarioService } from '../../tarifario/services/tarifario.service.js';
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

// Mismo cálculo que usa la prueba de la cotización en decisiones.service.spec.ts.
const calculo = (total: number) => ({
  espacioId: 'esp-1',
  tipoSolicitante: 'INTERNO',
  lineas: [],
  base: total,
  recargos: 0,
  subtotal: total,
  iva: 0,
  total,
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
    reembolso: { findFirst: vi.fn().mockResolvedValue(null) },
    bitacora: { findFirst: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn((fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const tarifario = {
    calcular: vi.fn().mockResolvedValue(calculo(200_000)),
    valorServicio: vi.fn().mockResolvedValue(50_000),
  };
  return {
    servicio: new SolicitudesService(prisma as unknown as PrismaService, tarifario as unknown as TarifarioService),
    prisma,
    tx,
    tarifario,
  };
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
          espacio: {
            codigo: 'B-101',
            nombre: 'Auditorio Mayor',
            tipoEspacioId: 'tipo-1',
            depositoValorFijo: 100_000,
            depositoPorcentaje: null,
          },
          inicio: new Date('2026-11-03T13:00:00.000Z'),
          fin: new Date('2026-11-03T17:00:00.000Z'),
          unidad: 'HORA',
          cantidad: { toString: () => '4' },
          valorUnitario: 20_000,
          recargos: 0,
          subtotal: 80_000,
        },
      ],
      actas: [{ id: 'acta-1', consecutivo: 'ACT-2026-0001', tipo: 'ENTREGA',
        observaciones: null, generadaEn: new Date('2026-11-03T13:00:00.000Z') }],
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
      expect.objectContaining({ id: 'r-1', cantidad: 4, subtotal: 80_000, inicio: '2026-11-03T13:00:00.000Z',
        tipoEspacioId: 'tipo-1', espacioCodigo: 'B-101', espacioNombre: 'Auditorio Mayor' }),
    ]);
    expect(r.servicios).toEqual([expect.objectContaining({ nombre: 'Sonido', subtotal: 50_000 })]);
    expect(r.decisiones).toEqual([
      { tipo: 'AVAL', resultado: 'APROBADA', motivo: null, decididaEn: '2026-10-22T10:00:00.000Z' },
    ]);
    expect(r.cotizacion).toMatchObject({ consecutivo: 'COT-2026-0001', total: 130_000 });
    expect(r.actas).toEqual([{ id: 'acta-1', consecutivo: 'ACT-2026-0001', tipo: 'ENTREGA',
      observaciones: null, registradaEn: '2026-11-03T13:00:00.000Z' }]);
    expect(e.prisma.solicitud.findFirst).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({
      actas: { orderBy: { generadaEn: 'asc' } },
      reservas: { orderBy: { inicio: 'asc' }, include: { espacio: { select: { codigo: true, nombre: true, tipoEspacioId: true, depositoValorFijo: true, depositoPorcentaje: true } } } },
    }) }));
  });

  const borrador = (cambios: Record<string, unknown> = {}) =>
    detalle({ cotizaciones: [], actas: [], estado: 'BORRADOR', ...cambios });

  it('borrador: las líneas y el estimado salen del mismo cálculo con la tarifa vigente', async () => {
    const e = crearEntorno();
    // El ítem de servicio quedó guardado en 0 cuando aún no había tarifa; la tarifa vigente es 50.000.
    const fila = borrador() as unknown as { servicios: Record<string, unknown>[]; reservas: Record<string, unknown>[] };
    Object.assign(fila.servicios[0]!, { cantidad: 2, valorUnitario: 0, subtotal: 0 });
    e.prisma.solicitud.findFirst.mockResolvedValue(fila);
    const r = await e.servicio.obtener(SOLICITUD_ID, usuario());

    expect(e.tarifario.calcular).toHaveBeenCalledWith(
      expect.objectContaining({ espacioId: 'esp-1', tipoSolicitante: 'INTERNO' }),
    );
    expect(e.tarifario.valorServicio).toHaveBeenCalledWith('srv-1', 'INTERNO');
    expect(r.servicios[0]).toMatchObject({ valorUnitario: 50_000, subtotal: 100_000 });
    expect(r.reservas[0]).toMatchObject({ subtotal: 200_000 });
    const lineas = r.reservas.reduce((s, x) => s + x.subtotal, 0) + r.servicios.reduce((s, x) => s + x.subtotal, 0);
    expect(r.estimado).toEqual({
      base: 300_000, recargos: 0, subtotal: 300_000, iva: 0, deposito: 100_000, total: 300_000,
    });
    expect(lineas).toBe(r.estimado.subtotal);
  });

  it('el estimado usa el depósito porcentual del espacio sobre sus propias franjas, sin servicios', async () => {
    const e = crearEntorno();
    const fila = borrador() as unknown as { reservas: { espacio: Record<string, unknown> }[] };
    Object.assign(fila.reservas[0]!.espacio, { depositoValorFijo: null, depositoPorcentaje: { toString: () => '20' } });
    e.prisma.solicitud.findFirst.mockResolvedValue(fila);
    const r = await e.servicio.obtener(SOLICITUD_ID, usuario());
    expect(r.estimado).toMatchObject({ subtotal: 250_000, deposito: 40_000 });
  });

  it('si el espacio no tiene tarifa vigente, usa los valores guardados del ítem', async () => {
    const e = crearEntorno();
    e.tarifario.calcular.mockRejectedValue(new ErrorDominio('TARIFA_NO_DEFINIDA', 'x', 422));
    e.prisma.solicitud.findFirst.mockResolvedValue(borrador());
    const r = await e.servicio.obtener(SOLICITUD_ID, usuario());
    expect(r.estimado).toMatchObject({ subtotal: 130_000, base: 130_000 });
    expect(r.reservas[0]).toMatchObject({ subtotal: 80_000 });
  });

  it('con cotización emitida nada se recalcula: el estimado y los ítems quedan congelados (RN-05)', async () => {
    const e = crearEntorno();
    e.tarifario.calcular.mockResolvedValue(calculo(999_000));
    e.tarifario.valorServicio.mockResolvedValue(999_000);
    e.prisma.solicitud.findFirst.mockResolvedValue(detalle({ actas: [] }));
    const r = await e.servicio.obtener(SOLICITUD_ID, usuario());

    expect(e.tarifario.calcular).not.toHaveBeenCalled();
    expect(e.tarifario.valorServicio).not.toHaveBeenCalled();
    expect(r.reservas[0]).toMatchObject({ subtotal: 80_000 });
    expect(r.servicios[0]).toMatchObject({ valorUnitario: 50_000, subtotal: 50_000 });
    expect(r.estimado).toEqual({
      base: 130_000, recargos: 0, subtotal: 130_000, iva: 0, deposito: 0, total: 130_000,
    });
  });

  it('expone el reembolso con el porcentaje registrado al cancelar; sin reembolso es null', async () => {
    const e = crearEntorno();
    e.prisma.solicitud.findFirst.mockResolvedValue(detalle({ estado: 'CANCELADA' }));
    expect((await e.servicio.obtener(SOLICITUD_ID, usuario())).reembolso).toBeNull();

    e.prisma.reembolso.findFirst.mockResolvedValue({
      valor: 333_000,
      estado: 'SOLICITADO',
      motivo: 'Cancelación por el solicitante: 50 % según política (7 días de antelación)',
      creadoEn: new Date('2026-11-05T15:00:00.000Z'),
    });
    e.prisma.bitacora.findFirst.mockResolvedValue({ datosDespues: { porcentajeReembolso: 50, valorReembolso: 333_000 } });
    const r = await e.servicio.obtener(SOLICITUD_ID, usuario());
    expect(r.reembolso).toEqual({
      valor: 333_000,
      porcentaje: 50,
      estado: 'SOLICITADO',
      motivo: 'Cancelación por el solicitante: 50 % según política (7 días de antelación)',
      creadoEn: '2026-11-05T15:00:00.000Z',
    });

    e.prisma.bitacora.findFirst.mockResolvedValue(null);
    expect((await e.servicio.obtener(SOLICITUD_ID, usuario())).reembolso).toMatchObject({ porcentaje: null });
  });

  it('sin cotización devuelve null', async () => {
    const e = crearEntorno();
    e.prisma.solicitud.findFirst.mockResolvedValue(detalle({ cotizaciones: [], actas: [] }));
    await expect(e.servicio.obtener(SOLICITUD_ID, usuario())).resolves.toMatchObject({ cotizacion: null, actas: [] });
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
