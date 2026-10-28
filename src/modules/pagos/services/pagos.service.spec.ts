import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlmacenamientoPort } from '../../../shared/almacenamiento/almacenamiento.port.js';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import type { ConsecutivoService } from '../../../shared/consecutivos/consecutivo.service.js';
import type { ParametroService } from '../../../shared/parametros/parametro.service.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { NotificacionesService } from '../../notificaciones/services/notificaciones.service.js';
import { PagosService } from './pagos.service.js';

const AHORA = new Date('2026-10-22T15:00:00.000Z');
const SOLICITUD_ID = '6e1d8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';
const ORDEN_ID = '9f1d8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';
const CONTEXTO = { ip: '10.0.0.1', userAgent: 'vitest', correlacionId: 'corr-1' };
const CUENTA = { banco: 'Banco Agrario', tipo: 'Ahorros', numero: '4-123', titular: 'ITP', nit: '800.247.940-1' };
const PDF = Buffer.from('%PDF-1.7\ncomprobante');

const usuario = (cambios: Partial<UsuarioAutenticado> = {}): UsuarioAutenticado => ({
  id: 'u-1',
  correo: 'ana@ejemplo.com',
  roles: ['SOLICITANTE'],
  dependencias: [],
  correoVerificado: true,
  esInstitucional: false,
  ...cambios,
});
const tesoreria = usuario({ id: 'u-tes', roles: ['TESORERIA'] });

const cotizacion = {
  id: 'cot-1',
  total: 250_000,
  depositoGarantia: 100_000,
  validaHasta: new Date('2026-10-24T15:00:00.000Z'),
};

const solicitud = (cambios: Record<string, unknown> = {}) => ({
  id: SOLICITUD_ID,
  estado: 'COTIZADA',
  esExenta: false,
  cotizaciones: [cotizacion],
  ...cambios,
});

const orden = (cambios: Record<string, unknown> = {}) => ({
  id: ORDEN_ID,
  referencia: 'OP-2026-000001',
  cotizacionId: 'cot-1',
  valor: 350_000,
  medio: 'CONSIGNACION',
  estado: 'PENDIENTE',
  soporteUrl: null,
  observacionTesoreria: null,
  pagadoEn: null,
  venceEn: new Date('2026-10-24T15:00:00.000Z'),
  ...cambios,
});

function crearEntorno(opciones: { solicitud?: unknown; perfil?: unknown } = {}) {
  const tx = {
    ordenPago: {
      create: vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve(orden(args.data))),
      update: vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve(orden(args.data))),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn(() => Promise.resolve(orden({ estado: 'EN_VERIFICACION', soporteUrl: 'pagos/x.pdf' }))),
    },
    solicitud: {
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    reembolso: { create: vi.fn().mockResolvedValue({}) },
    franjaOcupada: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    historialEstadoSolicitud: { create: vi.fn().mockResolvedValue({}) },
    bitacora: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    solicitante: {
      findUnique: vi.fn().mockResolvedValue(opciones.perfil === undefined ? { id: 'sol-1' } : opciones.perfil),
    },
    solicitud: {
      findFirst: vi.fn().mockResolvedValue(opciones.solicitud === undefined ? solicitud() : opciones.solicitud),
    },
    franjaOcupada: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    usuarioRol: { findMany: vi.fn().mockResolvedValue([{ usuarioId: 'u-tes' }, { usuarioId: 'u-tes' }]) },
    ordenPago: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    $transaction: vi.fn((fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const consecutivos = { siguiente: vi.fn().mockResolvedValue('OP-2026-000001') };
  const parametros = { obtenerJson: vi.fn().mockResolvedValue(CUENTA) };
  const almacenamiento = {
    guardar: vi.fn().mockResolvedValue(undefined),
    leer: vi.fn().mockResolvedValue(PDF),
    eliminar: vi.fn().mockResolvedValue(undefined),
  };
  const notificaciones = {
    notificarSolicitante: vi.fn().mockResolvedValue(undefined),
    notificarUsuario: vi.fn().mockResolvedValue(undefined),
    notificarAprobadores: vi.fn().mockResolvedValue(undefined),
  };
  const servicio = new PagosService(
    prisma as unknown as PrismaService,
    consecutivos as unknown as ConsecutivoService,
    parametros as unknown as ParametroService,
    almacenamiento as unknown as AlmacenamientoPort,
    notificaciones as unknown as NotificacionesService,
  );
  return { servicio, notificaciones, prisma, tx, consecutivos, parametros, almacenamiento };
}

const rechazo = (promesa: Promise<unknown>): Promise<unknown> => promesa.catch((e: unknown) => e);

describe('PagosService', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AHORA);
  });
  afterEach(() => vi.useRealTimers());

  describe('crearOrden', () => {
    it('crea la orden OP- por cotización más depósito, deja PAGO_PENDIENTE y devuelve la cuenta', async () => {
      const e = crearEntorno();
      const r = await e.servicio.crearOrden(SOLICITUD_ID, usuario(), CONTEXTO);

      expect(e.consecutivos.siguiente).toHaveBeenCalledWith(expect.anything(), 'ORDEN_PAGO');
      expect(e.tx.ordenPago.create).toHaveBeenCalledWith({
        data: {
          referencia: 'OP-2026-000001',
          cotizacionId: 'cot-1',
          valor: 350_000,
          medio: 'CONSIGNACION',
          venceEn: cotizacion.validaHasta,
        },
      });
      expect(e.tx.solicitud.updateMany).toHaveBeenCalledWith({
        where: { id: SOLICITUD_ID, estado: 'COTIZADA' },
        data: { estado: 'PAGO_PENDIENTE' },
      });
      expect(e.tx.historialEstadoSolicitud.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ estadoAnterior: 'COTIZADA', estadoNuevo: 'PAGO_PENDIENTE' }),
      });
      expect(e.tx.bitacora.create).toHaveBeenCalledOnce();
      expect(r).toMatchObject({
        referencia: 'OP-2026-000001',
        valor: 350_000,
        estado: 'PENDIENTE',
        tieneSoporte: false,
        cuentaRecaudo: CUENTA,
      });
    });

    it('una solicitud exenta responde 422 SOLICITUD_EXENTA (RN-08)', async () => {
      const e = crearEntorno({ solicitud: solicitud({ esExenta: true, estado: 'CONFIRMADA' }) });
      const error = await rechazo(e.servicio.crearOrden(SOLICITUD_ID, usuario(), CONTEXTO));
      expect(error).toMatchObject({ codigo: 'SOLICITUD_EXENTA', status: 422 });
    });

    it('una solicitud ajena responde 404', async () => {
      const e = crearEntorno({ solicitud: null });
      const error = await rechazo(e.servicio.crearOrden(SOLICITUD_ID, usuario(), CONTEXTO));
      expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
    });

    it('fuera de COTIZADA o PAGO_PENDIENTE responde 409 ORDEN_NO_PERMITIDA', async () => {
      const e = crearEntorno({ solicitud: solicitud({ estado: 'EN_REVISION' }) });
      const error = await rechazo(e.servicio.crearOrden(SOLICITUD_ID, usuario(), CONTEXTO));
      expect(error).toMatchObject({ codigo: 'ORDEN_NO_PERMITIDA', status: 409 });
    });

    it('con la cotización vencida responde 409 COTIZACION_VENCIDA', async () => {
      const vencida = { ...cotizacion, validaHasta: new Date('2026-10-22T14:00:00.000Z') };
      const e = crearEntorno({ solicitud: solicitud({ cotizaciones: [vencida] }) });
      const error = await rechazo(e.servicio.crearOrden(SOLICITUD_ID, usuario(), CONTEXTO));
      expect(error).toMatchObject({ codigo: 'COTIZACION_VENCIDA', status: 409 });
    });

    it('si ya hay una orden pendiente la devuelve sin crear otra', async () => {
      const e = crearEntorno();
      e.prisma.ordenPago.findFirst.mockResolvedValue(orden());
      const r = await e.servicio.crearOrden(SOLICITUD_ID, usuario(), CONTEXTO);
      expect(r.referencia).toBe('OP-2026-000001');
      expect(e.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('si la orden ya está en verificación responde 409', async () => {
      const e = crearEntorno();
      e.prisma.ordenPago.findFirst.mockResolvedValue(orden({ estado: 'EN_VERIFICACION' }));
      const error = await rechazo(e.servicio.crearOrden(SOLICITUD_ID, usuario(), CONTEXTO));
      expect(error).toMatchObject({ codigo: 'ORDEN_NO_PERMITIDA', status: 409 });
    });

    it('tras un rechazo (solicitud en PAGO_PENDIENTE) permite una orden nueva sin repetir la transición', async () => {
      const e = crearEntorno({ solicitud: solicitud({ estado: 'PAGO_PENDIENTE' }) });
      await e.servicio.crearOrden(SOLICITUD_ID, usuario(), CONTEXTO);
      expect(e.tx.ordenPago.create).toHaveBeenCalledOnce();
      expect(e.tx.solicitud.updateMany).toHaveBeenCalledWith({
        where: { id: SOLICITUD_ID, estado: 'PAGO_PENDIENTE' },
        data: { estado: 'PAGO_PENDIENTE' },
      });
      expect(e.tx.historialEstadoSolicitud.create).not.toHaveBeenCalled();
    });

    it('dos peticiones simultáneas: la segunda devuelve la orden pendiente creada por la primera', async () => {
      const e = crearEntorno();
      e.tx.solicitud.updateMany.mockResolvedValue({ count: 0 });
      e.tx.ordenPago.findFirst.mockResolvedValue(orden());
      const r = await e.servicio.crearOrden(SOLICITUD_ID, usuario(), CONTEXTO);

      expect(r.referencia).toBe('OP-2026-000001');
      expect(e.tx.ordenPago.create).not.toHaveBeenCalled();
      expect(e.consecutivos.siguiente).not.toHaveBeenCalled();
    });

    it('una orden concurrente ya en verificación o la solicitud cambiada dan 409 y no crean otra', async () => {
      const e = crearEntorno();
      e.tx.solicitud.updateMany.mockResolvedValue({ count: 0 });
      const error = await rechazo(e.servicio.crearOrden(SOLICITUD_ID, usuario(), CONTEXTO));
      expect(error).toMatchObject({ codigo: 'ORDEN_NO_PERMITIDA', status: 409 });

      const otro = crearEntorno({ solicitud: solicitud({ estado: 'PAGO_PENDIENTE' }) });
      otro.tx.ordenPago.findFirst.mockResolvedValue(orden({ estado: 'EN_VERIFICACION' }));
      const enVerificacion = await rechazo(otro.servicio.crearOrden(SOLICITUD_ID, usuario(), CONTEXTO));
      expect(enVerificacion).toMatchObject({ codigo: 'ORDEN_NO_PERMITIDA', status: 409 });
      expect(otro.tx.ordenPago.create).not.toHaveBeenCalled();
    });

    it('una cotización sin valor a pagar responde 422 ORDEN_SIN_VALOR y no un error de base de datos', async () => {
      const gratis = { ...cotizacion, total: 0, depositoGarantia: 0 };
      const e = crearEntorno({ solicitud: solicitud({ cotizaciones: [gratis] }) });
      const error = await rechazo(e.servicio.crearOrden(SOLICITUD_ID, usuario(), CONTEXTO));
      expect(error).toMatchObject({ codigo: 'ORDEN_SIN_VALOR', status: 422 });
      expect(e.prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('cargarSoporte', () => {
    const pendiente = () => orden();

    it('guarda el comprobante y pasa la orden a EN_VERIFICACION', async () => {
      const e = crearEntorno();
      e.prisma.ordenPago.findFirst.mockResolvedValue(pendiente());
      const r = await e.servicio.cargarSoporte(ORDEN_ID, { size: PDF.length, buffer: PDF }, usuario(), CONTEXTO);

      const clave = e.almacenamiento.guardar.mock.calls[0]![0] as string;
      expect(clave).toMatch(new RegExp(`^pagos/${ORDEN_ID}/[0-9a-f-]{36}\\.pdf$`));
      expect(e.tx.ordenPago.updateMany).toHaveBeenCalledWith({
        where: { id: ORDEN_ID, estado: 'PENDIENTE' },
        data: { soporteUrl: clave, estado: 'EN_VERIFICACION' },
      });
      expect(r).toMatchObject({ estado: 'EN_VERIFICACION', tieneSoporte: true });
      expect(r).not.toHaveProperty('soporteUrl');
    });

    it('si la orden ya no está pendiente al guardar (carrera con tesorería) responde 409 y no la revierte', async () => {
      const e = crearEntorno();
      e.prisma.ordenPago.findFirst.mockResolvedValue(pendiente());
      e.tx.ordenPago.updateMany.mockResolvedValue({ count: 0 });
      const error = await rechazo(
        e.servicio.cargarSoporte(ORDEN_ID, { size: PDF.length, buffer: PDF }, usuario(), CONTEXTO),
      );

      expect(error).toMatchObject({ codigo: 'ORDEN_NO_PERMITIDA', status: 409 });
      expect(e.tx.bitacora.create).not.toHaveBeenCalled();
      expect(e.almacenamiento.eliminar).toHaveBeenCalledOnce();
    });

    it.each([
      ['una orden que no es suya', null, 'NO_ENCONTRADO', 404],
      ['una orden que no está pendiente', orden({ estado: 'APROBADA' }), 'ORDEN_NO_PERMITIDA', 409],
      ['una orden vencida', orden({ venceEn: new Date('2026-10-22T14:00:00.000Z') }), 'ORDEN_VENCIDA', 409],
    ])('sobre %s responde %s', async (_caso, fila, codigo, status) => {
      const e = crearEntorno();
      e.prisma.ordenPago.findFirst.mockResolvedValue(fila);
      const error = await rechazo(
        e.servicio.cargarSoporte(ORDEN_ID, { size: PDF.length, buffer: PDF }, usuario(), CONTEXTO),
      );
      expect(error).toMatchObject({ codigo, status });
    });

    it.each([
      ['sin archivo', undefined, 'ARCHIVO_REQUERIDO'],
      ['de más de 10 MB', { size: 10 * 1024 * 1024 + 1, buffer: PDF }, 'ARCHIVO_MUY_GRANDE'],
      ['con contenido no permitido', { size: 5, buffer: Buffer.from('MZ...') }, 'ARCHIVO_NO_PERMITIDO'],
    ])('un archivo %s responde 422 %s', async (_caso, archivo, codigo) => {
      const e = crearEntorno();
      e.prisma.ordenPago.findFirst.mockResolvedValue(pendiente());
      const error = await rechazo(e.servicio.cargarSoporte(ORDEN_ID, archivo, usuario(), CONTEXTO));
      expect(error).toMatchObject({ codigo, status: 422 });
      expect(e.almacenamiento.guardar).not.toHaveBeenCalled();
    });

    it('si falla la base de datos, borra el archivo guardado', async () => {
      const e = crearEntorno();
      e.prisma.ordenPago.findFirst.mockResolvedValue(pendiente());
      e.prisma.$transaction.mockRejectedValueOnce(new Error('base caída'));
      await expect(
        e.servicio.cargarSoporte(ORDEN_ID, { size: PDF.length, buffer: PDF }, usuario(), CONTEXTO),
      ).rejects.toThrow('base caída');
      expect(e.almacenamiento.eliminar).toHaveBeenCalledOnce();
    });
  });

  describe('verificar', () => {
    const enVerificacion = (cambios: Record<string, unknown> = {}) =>
      orden({
        estado: 'EN_VERIFICACION',
        soporteUrl: 'pagos/x/y.pdf',
        cotizacion: { solicitud: { id: SOLICITUD_ID, estado: 'PAGO_PENDIENTE', reservas: [{ id: 'r-1' }] } },
        ...cambios,
      });

    it('aprobar confirma la orden, la solicitud y las franjas retenidas', async () => {
      const e = crearEntorno();
      e.prisma.ordenPago.findUnique.mockResolvedValue(enVerificacion());
      const r = await e.servicio.verificar(ORDEN_ID, { resultado: 'APROBADA' }, tesoreria, CONTEXTO);

      expect(r).toEqual({ estadoOrden: 'APROBADA', estadoSolicitud: 'CONFIRMADA' });
      expect(e.tx.ordenPago.update).toHaveBeenCalledWith({
        where: { id: ORDEN_ID },
        data: expect.objectContaining({
          estado: 'APROBADA',
          pagadoEn: AHORA,
          verificadaPorId: 'u-tes',
          observacionTesoreria: null,
        }),
      });
      expect(e.tx.solicitud.updateMany).toHaveBeenCalledWith({
        where: { id: SOLICITUD_ID, estado: 'PAGO_PENDIENTE' },
        data: { estado: 'CONFIRMADA', venceEn: null },
      });
      expect(e.tx.franjaOcupada.updateMany).toHaveBeenCalledWith({
        where: { reservaItemId: { in: ['r-1'] }, estado: 'RETENIDA' },
        data: { estado: 'CONFIRMADA', retenidaHasta: null },
      });
      expect(e.tx.bitacora.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ accion: 'PAGO_APROBADO', usuarioId: 'u-tes', correlacionId: 'corr-1' }),
      });
    });

    it('avisa al solicitante del resultado de la verificación', async () => {
      const e = crearEntorno();
      e.prisma.ordenPago.findUnique.mockResolvedValue(enVerificacion());
      await e.servicio.verificar(ORDEN_ID, { resultado: 'APROBADA' }, tesoreria, CONTEXTO);
      expect(e.notificaciones.notificarSolicitante).toHaveBeenCalledWith(
        SOLICITUD_ID,
        expect.objectContaining({ titulo: expect.stringContaining('Pago confirmado') }),
      );

      await e.servicio.verificar(
        ORDEN_ID,
        { resultado: 'RECHAZADA', observacion: 'No coincide.' },
        tesoreria,
        CONTEXTO,
      );
      expect(e.notificaciones.notificarSolicitante).toHaveBeenLastCalledWith(
        SOLICITUD_ID,
        expect.objectContaining({ titulo: expect.stringContaining('Pago rechazado') }),
      );
    });

    it('rechazar exige observación y deja la solicitud como estaba', async () => {
      const e = crearEntorno();
      e.prisma.ordenPago.findUnique.mockResolvedValue(enVerificacion());
      const sinMotivo = await rechazo(
        e.servicio.verificar(ORDEN_ID, { resultado: 'RECHAZADA', observacion: '  ' }, tesoreria, CONTEXTO),
      );
      expect(sinMotivo).toMatchObject({ codigo: 'MOTIVO_REQUERIDO', status: 422 });

      const r = await e.servicio.verificar(
        ORDEN_ID,
        { resultado: 'RECHAZADA', observacion: 'El valor no coincide.' },
        tesoreria,
        CONTEXTO,
      );
      expect(r).toEqual({ estadoOrden: 'RECHAZADA', estadoSolicitud: 'PAGO_PENDIENTE' });
      expect(e.tx.solicitud.update).not.toHaveBeenCalled();
      expect(e.tx.franjaOcupada.updateMany).not.toHaveBeenCalled();
      expect(e.tx.bitacora.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ accion: 'PAGO_RECHAZADO' }),
      });
    });

    it('una solicitud que ya no está en PAGO_PENDIENTE da 409 TRANSICION_INVALIDA y no un error 500', async () => {
      const e = crearEntorno();
      e.prisma.ordenPago.findUnique.mockResolvedValue(
        enVerificacion({
          cotizacion: { solicitud: { id: SOLICITUD_ID, estado: 'CANCELADA', reservas: [{ id: 'r-1' }] } },
        }),
      );
      const error = await rechazo(e.servicio.verificar(ORDEN_ID, { resultado: 'APROBADA' }, tesoreria, CONTEXTO));
      expect(error).toMatchObject({ codigo: 'TRANSICION_INVALIDA', status: 409 });
      expect(e.tx.franjaOcupada.updateMany).not.toHaveBeenCalled();
    });

    it('si la solicitud cambió de estado durante la verificación, no se confirma nada', async () => {
      const e = crearEntorno();
      e.prisma.ordenPago.findUnique.mockResolvedValue(enVerificacion());
      e.tx.solicitud.updateMany.mockResolvedValue({ count: 0 });
      const error = await rechazo(e.servicio.verificar(ORDEN_ID, { resultado: 'APROBADA' }, tesoreria, CONTEXTO));
      expect(error).toMatchObject({ codigo: 'TRANSICION_INVALIDA', status: 409 });
      expect(e.tx.franjaOcupada.updateMany).not.toHaveBeenCalled();
      expect(e.notificaciones.notificarSolicitante).not.toHaveBeenCalled();
    });

    it('si otra verificación resolvió la orden a la vez, esta no confirma nada', async () => {
      const e = crearEntorno();
      e.prisma.ordenPago.findUnique.mockResolvedValue(enVerificacion());
      e.tx.ordenPago.updateMany.mockResolvedValue({ count: 0 });
      const error = await rechazo(e.servicio.verificar(ORDEN_ID, { resultado: 'APROBADA' }, tesoreria, CONTEXTO));

      expect(error).toMatchObject({ codigo: 'ORDEN_NO_VERIFICABLE', status: 409 });
      expect(e.tx.solicitud.update).not.toHaveBeenCalled();
      expect(e.tx.franjaOcupada.updateMany).not.toHaveBeenCalled();
      expect(e.notificaciones.notificarSolicitante).not.toHaveBeenCalled();
    });

    it('una orden que no está en verificación responde 409 ORDEN_NO_VERIFICABLE', async () => {
      const e = crearEntorno();
      e.prisma.ordenPago.findUnique.mockResolvedValue(enVerificacion({ estado: 'PENDIENTE' }));
      const error = await rechazo(e.servicio.verificar(ORDEN_ID, { resultado: 'APROBADA' }, tesoreria, CONTEXTO));
      expect(error).toMatchObject({ codigo: 'ORDEN_NO_VERIFICABLE', status: 409 });
    });

    it('una orden inexistente responde 404', async () => {
      const e = crearEntorno();
      e.prisma.ordenPago.findUnique.mockResolvedValue(null);
      const error = await rechazo(e.servicio.verificar(ORDEN_ID, { resultado: 'APROBADA' }, tesoreria, CONTEXTO));
      expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
    });
  });

  describe('registrarPagoTardio', () => {
    const vencida = (cambios: Record<string, unknown> = {}) =>
      orden({
        estado: 'VENCIDA',
        cotizacion: {
          solicitud: {
            id: SOLICITUD_ID,
            estado: 'VENCIDA',
            consecutivo: 'SOL-2026-0001',
            reservas: [{ id: 'r-1' }],
          },
        },
        ...cambios,
      });
    const franja = {
      id: 'f-1',
      espacioId: 'esp-1',
      inicio: new Date('2026-11-03T12:30:00.000Z'),
      fin: new Date('2026-11-03T17:15:00.000Z'),
    };

    it('con las franjas libres las vuelve a ocupar y confirma la solicitud', async () => {
      const e = crearEntorno();
      e.prisma.ordenPago.findUnique.mockResolvedValue(vencida());
      e.prisma.franjaOcupada.findMany.mockResolvedValue([franja]);
      const r = await e.servicio.registrarPagoTardio(
        ORDEN_ID,
        { observacion: ' Extracto del 27. ' },
        tesoreria,
        CONTEXTO,
      );

      expect(r).toEqual({ resultado: 'CONFIRMADA', estadoSolicitud: 'CONFIRMADA', valorReembolso: null });
      expect(e.tx.ordenPago.updateMany).toHaveBeenCalledWith({
        where: { id: ORDEN_ID, estado: 'VENCIDA' },
        data: expect.objectContaining({
          estado: 'APROBADA',
          verificadaPorId: 'u-tes',
          observacionTesoreria: 'Extracto del 27.',
        }),
      });
      expect(e.tx.franjaOcupada.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['f-1'] } },
        data: { estado: 'CONFIRMADA', retenidaHasta: null },
      });
      expect(e.tx.solicitud.updateMany).toHaveBeenCalledWith({
        where: { id: SOLICITUD_ID, estado: 'VENCIDA' },
        data: { estado: 'CONFIRMADA', venceEn: null },
      });
      expect(e.tx.reembolso.create).not.toHaveBeenCalled();
      expect(e.tx.bitacora.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ accion: 'PAGO_TARDIO_CONFIRMADO' }),
      });
      expect(e.notificaciones.notificarSolicitante).toHaveBeenCalledWith(
        SOLICITUD_ID,
        expect.objectContaining({ titulo: expect.stringContaining('Pago confirmado') }),
      );
    });

    it('si el horario ya fue tomado marca el reembolso total y avisa a tesorería sin confirmar', async () => {
      const e = crearEntorno();
      e.prisma.ordenPago.findUnique.mockResolvedValue(vencida());
      e.prisma.franjaOcupada.findMany.mockResolvedValue([franja]);
      e.prisma.franjaOcupada.findFirst.mockResolvedValue({ id: 'otra' });
      const r = await e.servicio.registrarPagoTardio(ORDEN_ID, {}, tesoreria, CONTEXTO);

      expect(r).toEqual({ resultado: 'REEMBOLSO', estadoSolicitud: 'VENCIDA', valorReembolso: 350_000 });
      expect(e.tx.reembolso.create).toHaveBeenCalledWith({
        data: { ordenPagoId: ORDEN_ID, valor: 350_000, motivo: 'PAGO_TARDIO_SIN_FRANJA_LIBRE' },
      });
      expect(e.tx.solicitud.update).not.toHaveBeenCalled();
      expect(e.tx.franjaOcupada.updateMany).not.toHaveBeenCalled();
      expect(e.notificaciones.notificarSolicitante).toHaveBeenCalledWith(
        SOLICITUD_ID,
        expect.objectContaining({ titulo: expect.stringContaining('Reembolso') }),
      );
      expect(e.notificaciones.notificarUsuario).toHaveBeenCalledTimes(1);
      expect(e.notificaciones.notificarUsuario).toHaveBeenCalledWith('u-tes', expect.anything());
    });

    it('sin franjas que restaurar también termina en reembolso', async () => {
      const e = crearEntorno();
      e.prisma.ordenPago.findUnique.mockResolvedValue(vencida());
      const r = await e.servicio.registrarPagoTardio(ORDEN_ID, {}, tesoreria, CONTEXTO);
      expect(r.resultado).toBe('REEMBOLSO');
    });

    it.each([
      ['una orden que no está vencida', orden({ estado: 'PENDIENTE' })],
      [
        'una solicitud que no está vencida',
        vencida({ cotizacion: { solicitud: { id: SOLICITUD_ID, estado: 'CONFIRMADA', reservas: [] } } }),
      ],
    ])('sobre %s responde 409 PAGO_TARDIO_NO_APLICA', async (_caso, fila) => {
      const e = crearEntorno();
      e.prisma.ordenPago.findUnique.mockResolvedValue(
        'cotizacion' in (fila as object)
          ? fila
          : { ...(fila as object), cotizacion: { solicitud: { id: SOLICITUD_ID, estado: 'VENCIDA', reservas: [] } } },
      );
      const error = await rechazo(e.servicio.registrarPagoTardio(ORDEN_ID, {}, tesoreria, CONTEXTO));
      expect(error).toMatchObject({ codigo: 'PAGO_TARDIO_NO_APLICA', status: 409 });
      expect(e.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('si otra persona resolvió la orden a la vez, no escribe nada', async () => {
      const e = crearEntorno();
      e.prisma.ordenPago.findUnique.mockResolvedValue(vencida());
      e.prisma.franjaOcupada.findMany.mockResolvedValue([franja]);
      e.tx.ordenPago.updateMany.mockResolvedValue({ count: 0 });
      const error = await rechazo(e.servicio.registrarPagoTardio(ORDEN_ID, {}, tesoreria, CONTEXTO));
      expect(error).toMatchObject({ codigo: 'PAGO_TARDIO_NO_APLICA', status: 409 });
      expect(e.tx.franjaOcupada.updateMany).not.toHaveBeenCalled();
    });

    it('una orden inexistente responde 404', async () => {
      const e = crearEntorno();
      e.prisma.ordenPago.findUnique.mockResolvedValue(null);
      const error = await rechazo(e.servicio.registrarPagoTardio(ORDEN_ID, {}, tesoreria, CONTEXTO));
      expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
    });
  });

  describe('listar y descargarSoporte', () => {
    it('lista paginada con el consecutivo de la solicitud y sin exponer la ruta del soporte', async () => {
      const e = crearEntorno();
      e.prisma.ordenPago.count.mockResolvedValue(1);
      e.prisma.ordenPago.findMany.mockResolvedValue([
        {
          ...orden({ soporteUrl: 'pagos/x.pdf' }),
          cotizacion: { solicitudId: SOLICITUD_ID, solicitud: { consecutivo: 'SOL-2026-0001' } },
        },
      ]);
      const r = await e.servicio.listar({ estado: 'PENDIENTE', pagina: 1, porPagina: 20 });

      expect(e.prisma.ordenPago.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { estado: 'PENDIENTE' }, skip: 0, take: 20 }),
      );
      expect(r.total).toBe(1);
      expect(r.datos[0]).toMatchObject({
        referencia: 'OP-2026-000001',
        consecutivoSolicitud: 'SOL-2026-0001',
        tieneSoporte: true,
      });
      expect(r.datos[0]).not.toHaveProperty('soporteUrl');
    });

    it('tesorería descarga cualquier soporte; el solicitante solo el suyo', async () => {
      const e = crearEntorno();
      e.prisma.ordenPago.findUnique.mockResolvedValue(orden({ soporteUrl: 'pagos/x.pdf' }));
      await expect(e.servicio.descargarSoporte(ORDEN_ID, tesoreria)).resolves.toMatchObject({
        tipoMime: 'application/pdf',
        nombre: 'OP-2026-000001.pdf',
      });

      e.prisma.ordenPago.findFirst.mockResolvedValue(null);
      await expect(rechazo(e.servicio.descargarSoporte(ORDEN_ID, usuario()))).resolves.toMatchObject({
        codigo: 'NO_ENCONTRADO',
      });
    });

    it('una orden sin soporte responde 404', async () => {
      const e = crearEntorno();
      e.prisma.ordenPago.findUnique.mockResolvedValue(orden());
      await expect(rechazo(e.servicio.descargarSoporte(ORDEN_ID, tesoreria))).resolves.toMatchObject({
        codigo: 'NO_ENCONTRADO',
      });
    });
  });
});
