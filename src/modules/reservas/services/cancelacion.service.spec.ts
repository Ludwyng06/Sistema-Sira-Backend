import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import type { ParametroService } from '../../../shared/parametros/parametro.service.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { NotificacionesService } from '../../notificaciones/services/notificaciones.service.js';
import { CancelacionService, porcentajeReembolso } from './cancelacion.service.js';

const AHORA = new Date('2026-10-26T15:00:00.000Z');
const SOLICITUD_ID = '6e1d8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';
const CONTEXTO = { ip: '10.0.0.1', userAgent: 'vitest', correlacionId: 'corr-1' };
const POLITICA = [
  { diasAntes: 8, porcentaje: 100 },
  { diasAntes: 3, porcentaje: 50 },
  { diasAntes: 0, porcentaje: 0 },
];

const usuario = (cambios: Partial<UsuarioAutenticado> = {}): UsuarioAutenticado => ({
  id: 'u-1',
  correo: 'ana@ejemplo.com',
  roles: ['SOLICITANTE'],
  dependencias: [],
  correoVerificado: true,
  esInstitucional: false,
  ...cambios,
});

const solicitud = (cambios: Record<string, unknown> = {}) => ({
  id: SOLICITUD_ID,
  solicitanteId: 'sol-1',
  estado: 'CONFIRMADA',
  reservas: [{ id: 'r-1', inicio: new Date('2026-11-03T13:00:00.000Z') }],
  cotizaciones: [{ total: 200_000, esExenta: false, ordenesPago: [{ id: 'op-1' }] }],
  ...cambios,
});

function crearEntorno(fila: unknown = solicitud(), perfil: unknown = { id: 'sol-1' }) {
  const tx = {
    solicitud: {
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    franjaOcupada: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    historialEstadoSolicitud: { create: vi.fn().mockResolvedValue({}) },
    bitacora: { create: vi.fn().mockResolvedValue({}) },
    reembolso: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    solicitante: { findUnique: vi.fn().mockResolvedValue(perfil) },
    solicitud: { findFirst: vi.fn().mockResolvedValue(fila) },
    $transaction: vi.fn((fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const parametros = { obtenerJson: vi.fn().mockResolvedValue(POLITICA) };
  const notificaciones = {
    notificarSolicitante: vi.fn().mockResolvedValue(undefined),
    notificarUsuario: vi.fn().mockResolvedValue(undefined),
    notificarAprobadores: vi.fn().mockResolvedValue(undefined),
  };
  const servicio = new CancelacionService(
    prisma as unknown as PrismaService,
    parametros as unknown as ParametroService,
    notificaciones as unknown as NotificacionesService,
  );
  return { servicio, notificaciones, prisma, tx, parametros };
}

const rechazo = (promesa: Promise<unknown>): Promise<unknown> => promesa.catch((e: unknown) => e);

describe('porcentajeReembolso', () => {
  it.each([
    [10, 100],
    [8, 100],
    [7, 50],
    [3, 50],
    [2, 0],
    [0, 0],
  ])('con %i días de antelación reembolsa %i %%', (dias, esperado) => {
    expect(porcentajeReembolso(POLITICA, dias)).toBe(esperado);
  });

  it('sin tramos aplicables no reembolsa', () => {
    expect(porcentajeReembolso([], 30)).toBe(0);
    expect(porcentajeReembolso([{ diasAntes: 10, porcentaje: 100 }], 2)).toBe(0);
  });

  it('no depende del orden de la lista', () => {
    expect(porcentajeReembolso([...POLITICA].reverse(), 5)).toBe(50);
  });
});

describe('CancelacionService.cancelar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AHORA);
  });
  afterEach(() => vi.useRealTimers());

  it('el dueño cancela: libera franjas, escribe historial y bitácora y reembolsa según la política', async () => {
    const e = crearEntorno();
    const r = await e.servicio.cancelar(SOLICITUD_ID, { motivo: ' Cambió la fecha. ' }, usuario(), CONTEXTO);

    // 26 de octubre → 3 de noviembre = 8 días: tramo del 100 %.
    expect(r).toEqual({
      estadoSolicitud: 'CANCELADA',
      porcentajeReembolso: 100,
      valorReembolso: 200_000,
      canceladaPorInstitucion: false,
    });
    expect(e.tx.solicitud.update).toHaveBeenCalledWith({
      where: { id: SOLICITUD_ID },
      data: {
        estado: 'CANCELADA',
        motivoCancelacion: 'Cambió la fecha.',
        canceladaPorInstitucion: false,
        venceEn: null,
      },
    });
    expect(e.tx.franjaOcupada.updateMany).toHaveBeenCalledWith({
      where: { reservaItemId: { in: ['r-1'] }, estado: { not: 'LIBERADA' } },
      data: { estado: 'LIBERADA', retenidaHasta: null },
    });
    expect(e.tx.historialEstadoSolicitud.create).toHaveBeenCalledWith({
      data: {
        solicitudId: SOLICITUD_ID,
        estadoAnterior: 'CONFIRMADA',
        estadoNuevo: 'CANCELADA',
        usuarioId: 'u-1',
        observacion: 'Cambió la fecha.',
      },
    });
    expect(e.tx.bitacora.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accion: 'SOLICITUD_CANCELADA',
        correlacionId: 'corr-1',
        datosDespues: expect.objectContaining({ diasDeAntelacion: 8, porcentajeReembolso: 100 }),
      }),
    });
  });

  it('crea el reembolso SOLICITADO ligado a la orden aprobada, con motivo legible', async () => {
    const e = crearEntorno(solicitud({ reservas: [{ id: 'r-1', inicio: new Date('2026-11-02T13:00:00.000Z') }] }));
    await e.servicio.cancelar(SOLICITUD_ID, { motivo: 'x' }, usuario(), CONTEXTO);
    // 26 de octubre → 2 de noviembre = 7 días: tramo del 50 %.
    expect(e.tx.reembolso.create).toHaveBeenCalledWith({
      data: {
        ordenPagoId: 'op-1',
        valor: 100_000,
        motivo: 'Cancelación por el solicitante: 50 % según política (7 días de antelación)',
        estado: 'SOLICITADO',
      },
    });
  });

  it('una cancelación institucional crea el reembolso al 100 %', async () => {
    const e = crearEntorno(solicitud(), { id: 'otro-perfil' });
    await e.servicio.cancelar(SOLICITUD_ID, { motivo: 'Cierre' }, usuario({ roles: ['ADMINISTRADOR'] }), CONTEXTO);
    expect(e.tx.reembolso.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ valor: 200_000, motivo: 'Cancelación por la institución: 100 %' }),
    });
  });

  it('sin reembolso (0 %) o sin orden aprobada no crea fila', async () => {
    const sinReembolso = crearEntorno(
      solicitud({ reservas: [{ id: 'r-1', inicio: new Date('2026-10-26T22:00:00.000Z') }] }),
    );
    await sinReembolso.servicio.cancelar(SOLICITUD_ID, { motivo: 'x' }, usuario(), CONTEXTO);
    expect(sinReembolso.tx.reembolso.create).not.toHaveBeenCalled();

    const sinOrden = crearEntorno(
      solicitud({ cotizaciones: [{ total: 200_000, esExenta: false, ordenesPago: [] }] }),
    );
    await sinOrden.servicio.cancelar(SOLICITUD_ID, { motivo: 'x' }, usuario(), CONTEXTO);
    expect(sinOrden.tx.reembolso.create).not.toHaveBeenCalled();
  });

  it('avisa al solicitante de la cancelación y el reembolso', async () => {
    const e = crearEntorno(solicitud({ consecutivo: 'SOL-2026-0007' }));
    await e.servicio.cancelar(SOLICITUD_ID, { motivo: 'x' }, usuario(), CONTEXTO);
    expect(e.notificaciones.notificarSolicitante).toHaveBeenCalledWith(
      SOLICITUD_ID,
      expect.objectContaining({
        titulo: 'Solicitud SOL-2026-0007 cancelada',
        cuerpo: expect.stringContaining('100 % ($200.000)'),
      }),
    );
  });

  it('con poca antelación el reembolso baja de tramo', async () => {
    const e = crearEntorno(solicitud({ reservas: [{ id: 'r-1', inicio: new Date('2026-10-30T13:00:00.000Z') }] }));
    const r = await e.servicio.cancelar(SOLICITUD_ID, { motivo: 'x' }, usuario(), CONTEXTO);
    expect(r).toMatchObject({ porcentajeReembolso: 50, valorReembolso: 100_000 });
  });

  it('el mismo día no hay reembolso', async () => {
    const e = crearEntorno(solicitud({ reservas: [{ id: 'r-1', inicio: new Date('2026-10-26T22:00:00.000Z') }] }));
    const r = await e.servicio.cancelar(SOLICITUD_ID, { motivo: 'x' }, usuario(), CONTEXTO);
    expect(r).toMatchObject({ porcentajeReembolso: 0, valorReembolso: 0 });
  });

  it('una solicitud exenta no genera reembolso', async () => {
    const e = crearEntorno(solicitud({ cotizaciones: [{ total: 0, esExenta: true, ordenesPago: [] }] }));
    const r = await e.servicio.cancelar(SOLICITUD_ID, { motivo: 'x' }, usuario(), CONTEXTO);
    expect(r).toMatchObject({ porcentajeReembolso: 0, valorReembolso: 0 });
  });

  it('la administración cancela por causa institucional con reembolso del 100 %', async () => {
    const e = crearEntorno(
      solicitud({ reservas: [{ id: 'r-1', inicio: new Date('2026-10-27T13:00:00.000Z') }] }),
      null,
    );
    const r = await e.servicio.cancelar(
      SOLICITUD_ID,
      { motivo: 'Mantenimiento urgente del auditorio.' },
      usuario({ id: 'u-admin', roles: ['ADMINISTRADOR'] }),
      CONTEXTO,
    );

    expect(r).toMatchObject({ porcentajeReembolso: 100, valorReembolso: 200_000, canceladaPorInstitucion: true });
    expect(e.tx.solicitud.update).toHaveBeenCalledWith({
      where: { id: SOLICITUD_ID },
      data: expect.objectContaining({ canceladaPorInstitucion: true }),
    });
  });

  it('un administrador que es el dueño cancela como solicitante, no como institución', async () => {
    const e = crearEntorno(solicitud({ reservas: [{ id: 'r-1', inicio: new Date('2026-10-27T13:00:00.000Z') }] }));
    const r = await e.servicio.cancelar(
      SOLICITUD_ID,
      { motivo: 'x' },
      usuario({ roles: ['ADMINISTRADOR'] }),
      CONTEXTO,
    );
    expect(r).toMatchObject({ canceladaPorInstitucion: false, porcentajeReembolso: 0 });
  });

  it.each(['BORRADOR', 'EN_REVISION', 'COTIZADA', 'PAGO_PENDIENTE', 'EN_USO', 'CANCELADA'])(
    'una solicitud en %s da 409 SOLICITUD_NO_CANCELABLE',
    async (estado) => {
      const e = crearEntorno(solicitud({ estado }));
      const error = await rechazo(e.servicio.cancelar(SOLICITUD_ID, { motivo: 'x' }, usuario(), CONTEXTO));
      expect(error).toMatchObject({ codigo: 'SOLICITUD_NO_CANCELABLE', status: 409 });
      expect(e.prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('si la solicitud cambió de estado a la vez, no se cancela dos veces', async () => {
    const e = crearEntorno();
    e.tx.solicitud.updateMany.mockResolvedValue({ count: 0 });
    const error = await rechazo(e.servicio.cancelar(SOLICITUD_ID, { motivo: 'x' }, usuario(), CONTEXTO));
    expect(error).toMatchObject({ codigo: 'SOLICITUD_NO_CANCELABLE', status: 409 });
    expect(e.tx.franjaOcupada.updateMany).not.toHaveBeenCalled();
    expect(e.notificaciones.notificarSolicitante).not.toHaveBeenCalled();
  });

  it('un evento que ya empezó no se cancela', async () => {
    const e = crearEntorno(solicitud({ reservas: [{ id: 'r-1', inicio: new Date('2026-10-26T14:00:00.000Z') }] }));
    const error = await rechazo(e.servicio.cancelar(SOLICITUD_ID, { motivo: 'x' }, usuario(), CONTEXTO));
    expect(error).toMatchObject({ codigo: 'SOLICITUD_NO_CANCELABLE', status: 409 });
  });

  it('una solicitud ajena responde 404', async () => {
    const e = crearEntorno(null);
    const error = await rechazo(e.servicio.cancelar(SOLICITUD_ID, { motivo: 'x' }, usuario(), CONTEXTO));
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
  });

  it('un usuario sin perfil ni rol de administración recibe 404', async () => {
    const e = crearEntorno(solicitud(), null);
    const error = await rechazo(e.servicio.cancelar(SOLICITUD_ID, { motivo: 'x' }, usuario(), CONTEXTO));
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
  });

  it('una política mal formada falla con un error claro', async () => {
    const e = crearEntorno();
    e.parametros.obtenerJson.mockResolvedValue({ diasAntes: 8 });
    await expect(e.servicio.cancelar(SOLICITUD_ID, { motivo: 'x' }, usuario(), CONTEXTO)).rejects.toThrow(
      'politica_cancelacion',
    );
  });
});

describe('CancelacionService.simularCancelacion y cerrar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AHORA);
  });
  afterEach(() => vi.useRealTimers());

  it('simula el porcentaje y monto de reembolso sin modificar la solicitud (SRS 10.4)', async () => {
    const e = crearEntorno();
    const r = await e.servicio.simularCancelacion(SOLICITUD_ID, usuario());
    expect(r).toEqual({
      diasDeAntelacion: 8,
      porcentajeReembolso: 100,
      valorReembolso: 200_000,
      canceladaPorInstitucion: false,
    });
    expect(e.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('cierra una solicitud FINALIZADA cuando tiene acta de devolución (RN-15)', async () => {
    const e = crearEntorno(
      solicitud({
        estado: 'FINALIZADA',
        consecutivo: 'SOL-2026-0325',
        actas: [{ id: 'a-1', tipo: 'DEVOLUCION', consecutivo: 'ACT-2026-0074' }],
      }),
    );
    const r = await e.servicio.cerrar(
      SOLICITUD_ID,
      { observacion: 'Depósito devuelto sin descuentos.' },
      usuario({ roles: ['ADMINISTRADOR'] }),
      CONTEXTO,
    );
    expect(r).toEqual({
      estadoSolicitud: 'CERRADA',
      actaDevolucion: 'ACT-2026-0074',
      observacion: 'Depósito devuelto sin descuentos.',
    });
    expect(e.tx.solicitud.updateMany).toHaveBeenCalledWith({
      where: { id: SOLICITUD_ID, estado: 'FINALIZADA' },
      data: { estado: 'CERRADA' },
    });
  });

  it('rechaza cerrar si falta el acta de devolución (409 ACTA_DEVOLUCION_REQUERIDA)', async () => {
    const e = crearEntorno(solicitud({ estado: 'FINALIZADA', actas: [] }));
    const error = await rechazo(
      e.servicio.cerrar(SOLICITUD_ID, {}, usuario({ roles: ['ADMINISTRADOR'] }), CONTEXTO),
    );
    expect(error).toMatchObject({ codigo: 'ACTA_DEVOLUCION_REQUERIDA', status: 409 });
  });
});
