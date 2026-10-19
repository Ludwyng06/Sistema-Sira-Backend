import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import type { ConsecutivoService } from '../../../shared/consecutivos/consecutivo.service.js';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import type { ParametroService } from '../../../shared/parametros/parametro.service.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { TarifarioService } from '../../tarifario/services/tarifario.service.js';
import type { NotificacionesService } from '../../notificaciones/services/notificaciones.service.js';
import { DecisionesService } from './decisiones.service.js';

const AHORA = new Date('2026-10-22T15:00:00.000Z');
const SOLICITUD_ID = '6e1d8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';
const DEPENDENCIA_ID = '11111111-2222-4333-8444-555555555555';
const CONTEXTO = { ip: '10.0.0.1', userAgent: 'vitest', correlacionId: 'corr-1' };

const usuario = (cambios: Partial<UsuarioAutenticado> = {}): UsuarioAutenticado => ({
  id: 'u-resp',
  correo: 'resp@itp.edu.co',
  roles: ['RESPONSABLE_ESPACIO'],
  dependencias: [],
  correoVerificado: true,
  esInstitucional: true,
  ...cambios,
});

const aprobador = usuario({ id: 'u-apr', roles: ['APROBADOR'], dependencias: [DEPENDENCIA_ID] });

const reserva = (espacio: Record<string, unknown> = {}) => ({
  id: 'r-1',
  espacioId: 'esp-1',
  inicio: new Date('2026-11-03T13:00:00.000Z'),
  fin: new Date('2026-11-03T17:00:00.000Z'),
  espacio: {
    id: 'esp-1',
    responsableId: 'u-resp',
    dependenciaId: DEPENDENCIA_ID,
    requiereAval: true,
    depositoValorFijo: 100_000,
    depositoPorcentaje: null,
    tipo: { anticipacionMinimaDias: 2 },
    ...espacio,
  },
});

const solicitud = (cambios: Record<string, unknown> = {}) => ({
  id: SOLICITUD_ID,
  estado: 'EN_REVISION',
  esExenta: false,
  tipoTarifa: 'EMPRESA',
  enviadaEn: new Date('2026-10-21T15:00:00.000Z'),
  reservas: [reserva()],
  servicios: [{ id: 's-1', servicioId: 'srv-1', cantidad: 1, valorUnitario: 50_000, subtotal: 50_000 }],
  decisiones: [] as { tipo: string; resultado: string; decididaEn: Date }[],
  ...cambios,
});

const avalOtorgado = [{ tipo: 'AVAL', resultado: 'APROBADA', decididaEn: new Date('2026-10-22T10:00:00.000Z') }];

const calculo = (total: number) => ({
  espacioId: 'esp-1',
  tipoSolicitante: 'EMPRESA',
  lineas: [{ fecha: '2026-11-03', horas: 4, unidad: 'HORA', cantidad: 4, base: total, recargos: [], subtotal: total }],
  base: total,
  recargos: 0,
  subtotal: total,
  iva: 0,
  total,
});

function crearEntorno(fila: unknown = solicitud()) {
  const tx = {
    decision: {
      create: vi.fn().mockResolvedValue({ id: 'dec-1' }),
      count: vi.fn().mockResolvedValue(0),
    },
    franjaOcupada: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    cotizacion: { create: vi.fn().mockResolvedValue({}) },
    reservaItem: { update: vi.fn().mockResolvedValue({}) },
    solicitud: {
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    historialEstadoSolicitud: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    bitacora: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    solicitud: { findFirst: vi.fn().mockResolvedValue(fila) },
    $transaction: vi.fn((fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const tarifario = { calcular: vi.fn().mockResolvedValue(calculo(200_000)) };
  const consecutivos = { siguiente: vi.fn().mockResolvedValue('COT-2026-0001') };
  const parametros = { obtenerNumero: vi.fn().mockResolvedValue(48) };
  const notificaciones = {
    notificarSolicitante: vi.fn().mockResolvedValue(undefined),
    notificarUsuario: vi.fn().mockResolvedValue(undefined),
    notificarAprobadores: vi.fn().mockResolvedValue(undefined),
  };
  const servicio = new DecisionesService(
    prisma as unknown as PrismaService,
    tarifario as unknown as TarifarioService,
    consecutivos as unknown as ConsecutivoService,
    parametros as unknown as ParametroService,
    notificaciones as unknown as NotificacionesService,
  );
  return { servicio, notificaciones, prisma, tx, tarifario, consecutivos };
}

const rechazo = (promesa: Promise<unknown>): Promise<unknown> => promesa.catch((e: unknown) => e);
const pasos = (tx: ReturnType<typeof crearEntorno>['tx']) =>
  (tx.historialEstadoSolicitud.createMany.mock.calls[0]![0] as {
    data: { estadoAnterior: string; estadoNuevo: string }[];
  }).data.map((p) => `${p.estadoAnterior}>${p.estadoNuevo}`);

describe('DecisionesService.decidir', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AHORA);
  });
  afterEach(() => vi.useRealTimers());

  it('el aval aprobado se registra sin cambiar el estado', async () => {
    const e = crearEntorno();
    const r = await e.servicio.decidir(SOLICITUD_ID, { tipo: 'AVAL', resultado: 'APROBADA' }, usuario(), CONTEXTO);

    expect(r).toMatchObject({ decisionId: 'dec-1', estadoSolicitud: 'EN_REVISION', cotizacion: null });
    expect(e.tx.decision.create).toHaveBeenCalledWith({
      data: { solicitudId: SOLICITUD_ID, tipo: 'AVAL', resultado: 'APROBADA', motivo: null, decididaPorId: 'u-resp' },
      select: { id: true },
    });
    expect(e.tx.solicitud.update).not.toHaveBeenCalled();
    expect(e.tx.bitacora.create).toHaveBeenCalledOnce();
  });

  it('dos avales simultáneos: el segundo recibe 409 DECISION_YA_REGISTRADA y no duplica la decisión', async () => {
    const e = crearEntorno();
    e.tx.decision.count.mockResolvedValue(1);
    const error = await rechazo(
      e.servicio.decidir(SOLICITUD_ID, { tipo: 'AVAL', resultado: 'APROBADA' }, usuario(), CONTEXTO),
    );

    expect(error).toMatchObject({ codigo: 'DECISION_YA_REGISTRADA', status: 409 });
    expect(e.tx.decision.create).not.toHaveBeenCalled();
  });

  it('el aval aprobado avisa a los aprobadores de la dependencia, no al solicitante', async () => {
    const e = crearEntorno();
    await e.servicio.decidir(SOLICITUD_ID, { tipo: 'AVAL', resultado: 'APROBADA' }, usuario(), CONTEXTO);

    expect(e.notificaciones.notificarAprobadores).toHaveBeenCalledWith(
      [DEPENDENCIA_ID],
      expect.objectContaining({ enlace: `/solicitudes/${SOLICITUD_ID}` }),
    );
    expect(e.notificaciones.notificarSolicitante).not.toHaveBeenCalled();
  });

  it.each([
    ['APROBADA', 'fue aprobada'],
    ['RECHAZADA', 'fue rechazada'],
    ['DEVUELTA', 'fue devuelta'],
  ] as const)('la decisión %s avisa al solicitante', async (resultado, texto) => {
    const e = crearEntorno(solicitud({ decisiones: avalOtorgado }));
    await e.servicio.decidir(
      SOLICITUD_ID,
      { tipo: 'APROBACION', resultado, motivo: resultado === 'APROBADA' ? undefined : 'Razón.' },
      aprobador,
      CONTEXTO,
    );
    expect(e.notificaciones.notificarSolicitante).toHaveBeenCalledWith(
      SOLICITUD_ID,
      expect.objectContaining({ titulo: expect.stringContaining(texto) }),
    );
  });

  it('la aprobación de una solicitud que se cobra emite la cotización y queda COTIZADA', async () => {
    const e = crearEntorno(solicitud({ decisiones: avalOtorgado }));
    const r = await e.servicio.decidir(
      SOLICITUD_ID,
      { tipo: 'APROBACION', resultado: 'APROBADA' },
      aprobador,
      CONTEXTO,
    );

    expect(r).toMatchObject({ estadoSolicitud: 'COTIZADA', cotizacion: 'COT-2026-0001' });
    expect(e.consecutivos.siguiente).toHaveBeenCalledWith(expect.anything(), 'COTIZACION');
    expect(e.tx.cotizacion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        consecutivo: 'COT-2026-0001',
        subtotal: 250_000,
        iva: 0,
        total: 250_000,
        depositoGarantia: 100_000,
        valorReferencia: 0,
        esExenta: false,
        validaHasta: new Date('2026-10-24T15:00:00.000Z'),
      }),
    });
    expect(e.tx.solicitud.update).toHaveBeenCalledWith({
      where: { id: SOLICITUD_ID },
      data: {
        estado: 'COTIZADA',
        esExenta: false,
        tipoTarifa: 'EMPRESA',
        venceEn: new Date('2026-10-24T15:00:00.000Z'),
      },
    });
    expect(pasos(e.tx)).toEqual(['EN_REVISION>COTIZADA']);
    expect(e.tx.franjaOcupada.updateMany).toHaveBeenCalledWith({
      where: { reservaItemId: { in: ['r-1'] }, estado: 'RETENIDA' },
      data: { retenidaHasta: new Date('2026-10-24T15:00:00.000Z') },
    });
  });

  it('una solicitud exenta aprobada queda CONFIRMADA, con valor de referencia y sin pago', async () => {
    const e = crearEntorno(solicitud({ esExenta: true, tipoTarifa: 'INTERNO', decisiones: avalOtorgado }));
    const r = await e.servicio.decidir(
      SOLICITUD_ID,
      { tipo: 'APROBACION', resultado: 'APROBADA' },
      aprobador,
      CONTEXTO,
    );

    expect(r).toMatchObject({ estadoSolicitud: 'CONFIRMADA', cotizacion: 'COT-2026-0001' });
    expect(pasos(e.tx)).toEqual(['EN_REVISION>COTIZADA', 'COTIZADA>CONFIRMADA']);
    expect(e.tx.cotizacion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ esExenta: true, total: 0, depositoGarantia: 0, valorReferencia: 250_000 }),
    });
    expect(e.tx.franjaOcupada.updateMany).toHaveBeenCalledWith({
      where: { reservaItemId: { in: ['r-1'] }, estado: 'RETENIDA' },
      data: { estado: 'CONFIRMADA', retenidaHasta: null },
    });
    expect(e.tx.solicitud.update).toHaveBeenCalledWith({
      where: { id: SOLICITUD_ID },
      data: expect.objectContaining({ estado: 'CONFIRMADA', venceEn: null }),
    });
  });

  it('rechazar libera las franjas y deja la solicitud RECHAZADA', async () => {
    const e = crearEntorno();
    const r = await e.servicio.decidir(
      SOLICITUD_ID,
      { tipo: 'AVAL', resultado: 'RECHAZADA', motivo: ' Se cruza con una clase. ' },
      usuario(),
      CONTEXTO,
    );

    expect(r.estadoSolicitud).toBe('RECHAZADA');
    expect(e.tx.decision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ motivo: 'Se cruza con una clase.' }),
      select: { id: true },
    });
    expect(e.tx.franjaOcupada.updateMany).toHaveBeenCalledWith({
      where: { reservaItemId: { in: ['r-1'] }, estado: { not: 'LIBERADA' } },
      data: { estado: 'LIBERADA', retenidaHasta: null },
    });
    expect(e.tx.cotizacion.create).not.toHaveBeenCalled();
  });

  it('devolver libera las franjas, las desvincula del ítem y vuelve a BORRADOR', async () => {
    const e = crearEntorno();
    const r = await e.servicio.decidir(
      SOLICITUD_ID,
      { tipo: 'AVAL', resultado: 'DEVUELTA', motivo: 'Falta el responsable en sitio.' },
      usuario(),
      CONTEXTO,
    );

    expect(r.estadoSolicitud).toBe('BORRADOR');
    expect(pasos(e.tx)).toEqual(['EN_REVISION>BORRADOR']);
    expect(e.tx.franjaOcupada.updateMany).toHaveBeenCalledWith({
      where: { reservaItemId: { in: ['r-1'] } },
      data: { reservaItemId: null },
    });
  });

  it('reclasificar cobra como persona natural y emite la cotización', async () => {
    const e = crearEntorno(solicitud({ esExenta: true, tipoTarifa: 'INTERNO', decisiones: avalOtorgado }));
    const r = await e.servicio.decidir(
      SOLICITUD_ID,
      { tipo: 'APROBACION', resultado: 'RECLASIFICADA', motivo: 'El evento es de un tercero.' },
      aprobador,
      CONTEXTO,
    );

    expect(r).toMatchObject({ estadoSolicitud: 'COTIZADA', cotizacion: 'COT-2026-0001' });
    expect(e.tarifario.calcular).toHaveBeenCalledWith(
      expect.objectContaining({ tipoSolicitante: 'PERSONA_NATURAL' }),
    );
    expect(e.tx.solicitud.update).toHaveBeenCalledWith({
      where: { id: SOLICITUD_ID },
      data: expect.objectContaining({ esExenta: false, tipoTarifa: 'PERSONA_NATURAL' }),
    });
  });

  it('la aprobación sin aval previo da 422 AVAL_PENDIENTE', async () => {
    const e = crearEntorno();
    const error = await rechazo(
      e.servicio.decidir(SOLICITUD_ID, { tipo: 'APROBACION', resultado: 'APROBADA' }, aprobador, CONTEXTO),
    );
    expect(error).toMatchObject({ codigo: 'AVAL_PENDIENTE', status: 422 });
    expect(e.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('un aval anterior al último envío ya no cuenta', async () => {
    const e = crearEntorno(
      solicitud({
        decisiones: [{ tipo: 'AVAL', resultado: 'APROBADA', decididaEn: new Date('2026-10-20T10:00:00.000Z') }],
      }),
    );
    const error = await rechazo(
      e.servicio.decidir(SOLICITUD_ID, { tipo: 'APROBACION', resultado: 'APROBADA' }, aprobador, CONTEXTO),
    );
    expect(error).toMatchObject({ codigo: 'AVAL_PENDIENTE' });
  });

  it('si ningún espacio requiere aval, la aprobación procede y el aval da 422', async () => {
    const fila = solicitud({ reservas: [reserva({ requiereAval: false })] });
    const e = crearEntorno(fila);
    await expect(
      e.servicio.decidir(SOLICITUD_ID, { tipo: 'APROBACION', resultado: 'APROBADA' }, aprobador, CONTEXTO),
    ).resolves.toMatchObject({ estadoSolicitud: 'COTIZADA' });

    const otro = crearEntorno(fila);
    const error = await rechazo(
      otro.servicio.decidir(SOLICITUD_ID, { tipo: 'AVAL', resultado: 'APROBADA' }, usuario(), CONTEXTO),
    );
    expect(error).toMatchObject({ codigo: 'AVAL_NO_REQUERIDO', status: 422 });
  });

  it('un segundo aval aprobado da 409 DECISION_YA_REGISTRADA', async () => {
    const e = crearEntorno(solicitud({ decisiones: avalOtorgado }));
    const error = await rechazo(
      e.servicio.decidir(SOLICITUD_ID, { tipo: 'AVAL', resultado: 'APROBADA' }, usuario(), CONTEXTO),
    );
    expect(error).toMatchObject({ codigo: 'DECISION_YA_REGISTRADA', status: 409 });
  });

  it.each(['RECHAZADA', 'DEVUELTA', 'RECLASIFICADA'] as const)(
    '%s sin motivo da 422 MOTIVO_REQUERIDO',
    async (resultado) => {
      const e = crearEntorno(solicitud({ esExenta: true, decisiones: avalOtorgado }));
      const error = await rechazo(
        e.servicio.decidir(SOLICITUD_ID, { tipo: 'APROBACION', resultado, motivo: '   ' }, aprobador, CONTEXTO),
      );
      expect(error).toMatchObject({ codigo: 'MOTIVO_REQUERIDO', status: 422 });
    },
  );

  it('reclasificar una solicitud que ya se cobra da 422 RESULTADO_INVALIDO', async () => {
    const e = crearEntorno(solicitud({ decisiones: avalOtorgado }));
    const error = await rechazo(
      e.servicio.decidir(
        SOLICITUD_ID,
        { tipo: 'APROBACION', resultado: 'RECLASIFICADA', motivo: 'x' },
        aprobador,
        CONTEXTO,
      ),
    );
    expect(error).toMatchObject({ codigo: 'RESULTADO_INVALIDO', status: 422 });
  });

  it('si otra decisión cambió el estado a la vez, esta no escribe nada y da 409', async () => {
    const e = crearEntorno(solicitud({ decisiones: avalOtorgado }));
    e.tx.solicitud.updateMany.mockResolvedValue({ count: 0 });
    const error = await rechazo(
      e.servicio.decidir(SOLICITUD_ID, { tipo: 'APROBACION', resultado: 'APROBADA' }, aprobador, CONTEXTO),
    );
    expect(error).toMatchObject({ codigo: 'SOLICITUD_NO_DECIDIBLE', status: 409 });
    expect(e.tx.decision.create).not.toHaveBeenCalled();
    expect(e.tx.cotizacion.create).not.toHaveBeenCalled();
    expect(e.notificaciones.notificarSolicitante).not.toHaveBeenCalled();
  });

  it('una solicitud fuera de EN_REVISION da 409 SOLICITUD_NO_DECIDIBLE', async () => {
    const e = crearEntorno(solicitud({ estado: 'COTIZADA' }));
    const error = await rechazo(
      e.servicio.decidir(SOLICITUD_ID, { tipo: 'AVAL', resultado: 'APROBADA' }, usuario(), CONTEXTO),
    );
    expect(error).toMatchObject({ codigo: 'SOLICITUD_NO_DECIDIBLE', status: 409 });
  });

  it.each([
    ['inexistente o en borrador', null, usuario(), 'AVAL'],
    ['responsable de otro espacio', solicitud(), usuario({ id: 'u-otro' }), 'AVAL'],
    [
      'aprobador de otra dependencia',
      solicitud(),
      usuario({ roles: ['APROBADOR'], dependencias: ['otra'] }),
      'APROBACION',
    ],
    ['aprobador que da el aval', solicitud(), aprobador, 'AVAL'],
  ] as const)('%s recibe 404', async (_caso, fila, quien, tipo) => {
    const e = crearEntorno(fila);
    const error = await rechazo(
      e.servicio.decidir(SOLICITUD_ID, { tipo, resultado: 'APROBADA' }, quien, CONTEXTO),
    );
    expect(error).toBeInstanceOf(ErrorDominio);
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
  });
});
