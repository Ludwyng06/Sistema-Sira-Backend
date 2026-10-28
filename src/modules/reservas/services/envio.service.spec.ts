import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import type { ConsecutivoService } from '../../../shared/consecutivos/consecutivo.service.js';
import type { ParametroService } from '../../../shared/parametros/parametro.service.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { TarifarioService } from '../../tarifario/services/tarifario.service.js';
import type { BusquedaService } from '../../disponibilidad/services/busqueda.service.js';
import type { NotificacionesService } from '../../notificaciones/services/notificaciones.service.js';
import { EnvioService } from './envio.service.js';
import type { SolicitudesService } from './solicitudes.service.js';

const AHORA = new Date('2026-10-21T15:00:00.000Z');
const SOLICITUD_ID = '6e1d8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';
const ESPACIO_ID = '8a3b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';
const CONTEXTO = { ip: '10.0.0.1', userAgent: 'vitest', correlacionId: 'corr-1' };

const usuario: UsuarioAutenticado = {
  id: 'u-1',
  correo: 'ana@itp.edu.co',
  roles: ['SOLICITANTE'],
  dependencias: [],
  correoVerificado: true,
  esInstitucional: true,
};

const borrador = (cambios: Record<string, unknown> = {}) => ({
  id: SOLICITUD_ID,
  consecutivo: null,
  solicitanteId: 'sol-1',
  dependenciaId: 'dep-1',
  objetoEvento: 'Congreso',
  descripcion: null,
  asistentesEstimados: 40,
  responsableEnSitio: null,
  telefonoContacto: null,
  eventoPublico: true,
  declaraUsoInstitucional: true,
  esExenta: false,
  tipoTarifa: 'INTERNO',
  estado: 'BORRADOR',
  enviadaEn: null,
  venceEn: null,
  creadoEn: AHORA,
  actualizadoEn: AHORA,
  ...cambios,
});

const reserva = (cambios: Record<string, unknown> = {}, espacio: Record<string, unknown> = {}) => ({
  id: 'r-1',
  espacioId: ESPACIO_ID,
  inicio: new Date('2026-11-03T13:00:00.000Z'),
  fin: new Date('2026-11-03T17:00:00.000Z'),
  espacio: {
    id: ESPACIO_ID,
    archivadoEn: null,
    esReservable: true,
    estado: 'DISPONIBLE',
    capacidadPersonas: 60,
    minutosMontaje: 30,
    minutosDesmontaje: 15,
    tipo: { anticipacionMinimaDias: 2, anticipacionEnHabiles: true, aforoExigePoliza: null },
    horarios: [{ diaSemana: 2, abre: '06:00', cierra: '22:00' }],
    ...espacio,
  },
  ...cambios,
});

const estimado = {
  lineas: [{ fecha: '2026-11-03', horas: 4, unidad: 'HORA', cantidad: 4, base: 0, recargos: [], subtotal: 0 }],
  base: 0,
  recargos: 0,
  subtotal: 0,
  iva: 0,
  total: 0,
};

function crearEntorno(opciones: { reservas?: unknown[]; solicitud?: unknown; cuenta?: unknown } = {}) {
  const tx = {
    franjaOcupada: { create: vi.fn().mockResolvedValue({}) },
    reservaItem: {
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(opciones.reservas?.length ?? 1),
    },
    solicitud: {
      update: vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve(borrador(args.data))),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    historialEstadoSolicitud: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    bitacora: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    usuario: {
      findUnique: vi
        .fn()
        .mockResolvedValue(opciones.cuenta ?? { correoVerificado: true, esInstitucional: true }),
    },
    reservaItem: { findMany: vi.fn().mockResolvedValue(opciones.reservas ?? [reserva()]) },
    festivo: { findMany: vi.fn().mockResolvedValue([]) },
    documentoAdjunto: { count: vi.fn().mockResolvedValue(0) },
    franjaOcupada: { findMany: vi.fn().mockResolvedValue([]) },
    solicitante: { findUnique: vi.fn().mockResolvedValue({ tipo: 'INTERNO' }) },
    $transaction: vi.fn((fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const solicitudes = { borradorPropio: vi.fn().mockResolvedValue(opciones.solicitud ?? borrador()) };
  const tarifario = { calcular: vi.fn().mockResolvedValue(estimado) };
  const consecutivos = { siguiente: vi.fn().mockResolvedValue('SOL-2026-0001') };
  const parametros = { obtenerNumero: vi.fn().mockResolvedValue(72) };
  const notificaciones = {
    notificarSolicitante: vi.fn().mockResolvedValue(undefined),
    notificarUsuario: vi.fn().mockResolvedValue(undefined),
    notificarAprobadores: vi.fn().mockResolvedValue(undefined),
  };
  const busqueda = {
    buscar: vi.fn().mockResolvedValue({
      espacios: [
        {
          espacioId: ESPACIO_ID,
          codigo: 'A-1',
          nombre: 'Mismo espacio',
          capacidadPersonas: 60,
          bloque: { codigo: 'A', nombre: 'Bloque A' },
          sede: { codigo: 'MOC', nombre: 'Mocoa' },
        },
        {
          espacioId: 'otro-1',
          codigo: 'B-2',
          nombre: 'Aula B-2',
          capacidadPersonas: 45,
          bloque: { codigo: 'B', nombre: 'Bloque B' },
          sede: { codigo: 'MOC', nombre: 'Mocoa' },
        },
      ],
    }),
  };
  const servicio = new EnvioService(
    prisma as unknown as PrismaService,
    solicitudes as unknown as SolicitudesService,
    tarifario as unknown as TarifarioService,
    consecutivos as unknown as ConsecutivoService,
    parametros as unknown as ParametroService,
    notificaciones as unknown as NotificacionesService,
    busqueda as unknown as BusquedaService,
  );
  return { servicio, notificaciones, busqueda, prisma, tx, solicitudes, tarifario, consecutivos };
}

const rechazo = (promesa: Promise<unknown>): Promise<unknown> => promesa.catch((e: unknown) => e);

const problemasDe = (error: unknown): string[] =>
  ((error as { detalles: { problemas: { codigo: string }[] } }).detalles.problemas ?? []).map((p) => p.codigo);

describe('EnvioService.enviar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AHORA);
  });
  afterEach(() => vi.useRealTimers());

  it('envía: consecutivo, franjas RETENIDA con montaje y desmontaje, EN_REVISION e historial', async () => {
    const e = crearEntorno();
    const resultado = await e.servicio.enviar(SOLICITUD_ID, usuario, CONTEXTO);

    expect(e.consecutivos.siguiente).toHaveBeenCalledWith(expect.anything(), 'SOLICITUD');
    expect(e.tx.franjaOcupada.create).toHaveBeenCalledWith({
      data: {
        espacioId: ESPACIO_ID,
        inicio: new Date('2026-11-03T12:30:00.000Z'),
        fin: new Date('2026-11-03T17:15:00.000Z'),
        estado: 'RETENIDA',
        origen: 'RESERVA',
        reservaItemId: 'r-1',
        retenidaHasta: new Date('2026-10-24T15:00:00.000Z'),
        etiquetaPublica: 'Congreso',
      },
    });
    expect(e.tx.solicitud.update).toHaveBeenCalledWith({
      where: { id: SOLICITUD_ID },
      data: {
        consecutivo: 'SOL-2026-0001',
        estado: 'EN_REVISION',
        enviadaEn: AHORA,
        venceEn: new Date('2026-10-24T15:00:00.000Z'),
        esExenta: true,
        tipoTarifa: 'INTERNO',
      },
    });
    expect(e.tx.historialEstadoSolicitud.createMany).toHaveBeenCalledWith({
      data: [
        { solicitudId: SOLICITUD_ID, estadoAnterior: 'BORRADOR', estadoNuevo: 'ENVIADA', usuarioId: 'u-1' },
        { solicitudId: SOLICITUD_ID, estadoAnterior: 'ENVIADA', estadoNuevo: 'EN_REVISION', usuarioId: 'u-1' },
      ],
    });
    expect(e.tx.bitacora.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ accion: 'SOLICITUD_ENVIADA', entidadId: SOLICITUD_ID, correlacionId: 'corr-1' }),
    });
    expect(resultado).toMatchObject({ estado: 'EN_REVISION', consecutivo: 'SOL-2026-0001', esExenta: true });
  });

  it('dos envíos simultáneos: el segundo recibe 409 SOLICITUD_NO_EDITABLE y no retiene franjas', async () => {
    const e = crearEntorno();
    e.tx.solicitud.updateMany.mockResolvedValue({ count: 0 });
    const error = await rechazo(e.servicio.enviar(SOLICITUD_ID, usuario, CONTEXTO));

    expect(error).toMatchObject({ codigo: 'SOLICITUD_NO_EDITABLE', status: 409 });
    expect(e.tx.solicitud.updateMany).toHaveBeenCalledWith({
      where: { id: SOLICITUD_ID, estado: 'BORRADOR' },
      data: { actualizadoEn: expect.any(Date) },
    });
    expect(e.tx.franjaOcupada.create).not.toHaveBeenCalled();
    expect(e.consecutivos.siguiente).not.toHaveBeenCalled();
    expect(e.notificaciones.notificarSolicitante).not.toHaveBeenCalled();
  });

  it('una reserva agregada mientras se enviaba no queda sin franja: 409 SOLICITUD_MODIFICADA', async () => {
    const e = crearEntorno();
    e.tx.reservaItem.count.mockResolvedValue(2);
    const error = await rechazo(e.servicio.enviar(SOLICITUD_ID, usuario, CONTEXTO));

    expect(error).toMatchObject({ codigo: 'SOLICITUD_MODIFICADA', status: 409 });
    expect(e.tx.franjaOcupada.create).not.toHaveBeenCalled();
    expect(e.tx.solicitud.update).not.toHaveBeenCalled();
  });

  it('avisa al solicitante y al responsable de cada espacio al enviar', async () => {
    const e = crearEntorno({
      reservas: [reserva({}, { responsableId: 'u-resp' }), reserva({ id: 'r-2' }, { responsableId: 'u-resp' })],
    });
    await e.servicio.enviar(SOLICITUD_ID, usuario, CONTEXTO);

    expect(e.notificaciones.notificarSolicitante).toHaveBeenCalledWith(
      SOLICITUD_ID,
      expect.objectContaining({ titulo: 'Recibimos tu solicitud SOL-2026-0001' }),
    );
    expect(e.notificaciones.notificarUsuario).toHaveBeenCalledTimes(1);
    expect(e.notificaciones.notificarUsuario).toHaveBeenCalledWith(
      'u-resp',
      expect.objectContaining({ enlace: `/solicitudes/${SOLICITUD_ID}` }),
    );
  });

  it('un interno que declara uso particular paga tarifa de persona natural y no es exento (RN-10)', async () => {
    const e = crearEntorno({ solicitud: borrador({ declaraUsoInstitucional: false }) });
    await e.servicio.enviar(SOLICITUD_ID, usuario, CONTEXTO);

    expect(e.tarifario.calcular).toHaveBeenCalledWith(
      expect.objectContaining({ tipoSolicitante: 'PERSONA_NATURAL' }),
    );
    expect(e.tx.solicitud.update).toHaveBeenCalledWith({
      where: { id: SOLICITUD_ID },
      data: expect.objectContaining({ esExenta: false, tipoTarifa: 'PERSONA_NATURAL' }),
    });
  });

  it('un externo no es exento aunque declare uso institucional y conserva su tipo', async () => {
    const e = crearEntorno({
      solicitud: borrador({ declaraUsoInstitucional: true }),
      cuenta: { correoVerificado: true, esInstitucional: false },
    });
    e.prisma.solicitante.findUnique.mockResolvedValue({ tipo: 'EMPRESA' });
    await e.servicio.enviar(SOLICITUD_ID, usuario, CONTEXTO);

    expect(e.tx.solicitud.update).toHaveBeenCalledWith({
      where: { id: SOLICITUD_ID },
      data: expect.objectContaining({ esExenta: false, tipoTarifa: 'EMPRESA' }),
    });
  });

  it('sin correo verificado responde 422 CORREO_NO_VERIFICADO (RN-09)', async () => {
    const e = crearEntorno({ cuenta: { correoVerificado: false, esInstitucional: true } });
    const error = await rechazo(e.servicio.enviar(SOLICITUD_ID, usuario, CONTEXTO));
    expect(error).toMatchObject({ codigo: 'CORREO_NO_VERIFICADO', status: 422 });
    expect(e.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('sin reservas responde 422 SOLICITUD_SIN_RESERVAS', async () => {
    const e = crearEntorno({ reservas: [] });
    const error = await rechazo(e.servicio.enviar(SOLICITUD_ID, usuario, CONTEXTO));
    expect(error).toMatchObject({ codigo: 'SOLICITUD_SIN_RESERVAS', status: 422 });
  });

  it('un horario fuera de la operación del espacio da FUERA_DE_HORARIO (RN-19)', async () => {
    const e = crearEntorno({
      reservas: [reserva({ inicio: new Date('2026-11-03T10:00:00.000Z'), fin: new Date('2026-11-03T12:00:00.000Z') })],
    });
    const error = await rechazo(e.servicio.enviar(SOLICITUD_ID, usuario, CONTEXTO));
    expect(error).toMatchObject({ codigo: 'SOLICITUD_INCOMPLETA', status: 422 });
    expect(problemasDe(error)).toEqual(['FUERA_DE_HORARIO']);
  });

  it('un día sin fila en un espacio con horario da FUERA_DE_HORARIO', async () => {
    const e = crearEntorno({
      reservas: [reserva({}, { horarios: [{ diaSemana: 1, abre: '06:00', cierra: '22:00' }] })],
    });
    const error = await rechazo(e.servicio.enviar(SOLICITUD_ID, usuario, CONTEXTO));
    expect(problemasDe(error)).toEqual(['FUERA_DE_HORARIO']);
  });

  it('un espacio sin horario configurado no se restringe', async () => {
    const e = crearEntorno({ reservas: [reserva({}, { horarios: [] })] });
    await expect(e.servicio.enviar(SOLICITUD_ID, usuario, CONTEXTO)).resolves.toMatchObject({
      estado: 'EN_REVISION',
    });
  });

  it('con poca anticipación en días hábiles da ANTICIPACION_INSUFICIENTE (RN-04)', async () => {
    const e = crearEntorno({
      reservas: [
        reserva({ inicio: new Date('2026-10-22T13:00:00.000Z'), fin: new Date('2026-10-22T15:00:00.000Z') }, {
          horarios: [{ diaSemana: 4, abre: '06:00', cierra: '22:00' }],
        }),
      ],
    });
    const error = await rechazo(e.servicio.enviar(SOLICITUD_ID, usuario, CONTEXTO));
    expect(problemasDe(error)).toContain('ANTICIPACION_INSUFICIENTE');
  });

  it('un aforo mayor que la capacidad da AFORO_EXCEDIDO (RN-18)', async () => {
    const e = crearEntorno({ solicitud: borrador({ asistentesEstimados: 200 }) });
    const error = await rechazo(e.servicio.enviar(SOLICITUD_ID, usuario, CONTEXTO));
    expect(problemasDe(error)).toContain('AFORO_EXCEDIDO');
  });

  it('un aforo sobre el umbral sin póliza da POLIZA_REQUERIDA (RN-20)', async () => {
    const e = crearEntorno({
      solicitud: borrador({ asistentesEstimados: 50 }),
      reservas: [
        reserva({}, { tipo: { anticipacionMinimaDias: 2, anticipacionEnHabiles: true, aforoExigePoliza: 40 } }),
      ],
    });
    const error = await rechazo(e.servicio.enviar(SOLICITUD_ID, usuario, CONTEXTO));
    expect(problemasDe(error)).toEqual(['POLIZA_REQUERIDA']);
    expect(e.prisma.documentoAdjunto.count).toHaveBeenCalledWith({
      where: { solicitudId: SOLICITUD_ID, tipo: 'POLIZA' },
    });
  });

  it('con la póliza adjunta el envío procede', async () => {
    const e = crearEntorno({
      solicitud: borrador({ asistentesEstimados: 50 }),
      reservas: [
        reserva({}, { tipo: { anticipacionMinimaDias: 2, anticipacionEnHabiles: true, aforoExigePoliza: 40 } }),
      ],
    });
    e.prisma.documentoAdjunto.count.mockResolvedValue(1);
    await expect(e.servicio.enviar(SOLICITUD_ID, usuario, CONTEXTO)).resolves.toMatchObject({
      estado: 'EN_REVISION',
    });
  });

  it('un espacio fuera de servicio da ESPACIO_NO_DISPONIBLE (RN-16)', async () => {
    const e = crearEntorno({ reservas: [reserva({}, { estado: 'FUERA_DE_SERVICIO' })] });
    const error = await rechazo(e.servicio.enviar(SOLICITUD_ID, usuario, CONTEXTO));
    expect(problemasDe(error)).toEqual(['ESPACIO_NO_DISPONIBLE']);
  });

  it('el plazo de revisión no pasa de la anticipación mínima antes del evento (RN-02)', async () => {
    const e = crearEntorno({
      reservas: [
        reserva({ inicio: new Date('2026-10-26T13:00:00.000Z'), fin: new Date('2026-10-26T15:00:00.000Z') }, {
          horarios: [{ diaSemana: 1, abre: '06:00', cierra: '22:00' }],
        }),
      ],
    });
    await e.servicio.enviar(SOLICITUD_ID, usuario, CONTEXTO);
    expect(e.tx.solicitud.update).toHaveBeenCalledWith({
      where: { id: SOLICITUD_ID },
      data: expect.objectContaining({ venceEn: new Date('2026-10-24T13:00:00.000Z') }),
    });
  });

  it('una franja ya ocupada da 409 FRANJA_NO_DISPONIBLE con los conflictos y no escribe', async () => {
    const e = crearEntorno();
    e.prisma.franjaOcupada.findMany.mockResolvedValue([
      {
        espacioId: ESPACIO_ID,
        inicio: new Date('2026-11-03T14:00:00.000Z'),
        fin: new Date('2026-11-03T15:00:00.000Z'),
      },
    ]);
    const error = await rechazo(e.servicio.enviar(SOLICITUD_ID, usuario, CONTEXTO));

    expect(error).toMatchObject({
      codigo: 'FRANJA_NO_DISPONIBLE',
      status: 409,
      detalles: {
        conflictos: [
          { espacioId: ESPACIO_ID, inicio: '2026-11-03T14:00:00.000Z', fin: '2026-11-03T15:00:00.000Z' },
        ],
      },
    });
    expect(e.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('el 409 por franja ocupada sugiere otros espacios libres, sin repetir el ocupado', async () => {
    const e = crearEntorno();
    e.prisma.franjaOcupada.findMany.mockResolvedValue([
      {
        espacioId: ESPACIO_ID,
        inicio: new Date('2026-11-03T14:00:00.000Z'),
        fin: new Date('2026-11-03T15:00:00.000Z'),
      },
    ]);
    const error = await rechazo(e.servicio.enviar(SOLICITUD_ID, usuario, CONTEXTO));

    expect(e.busqueda.buscar).toHaveBeenCalledWith({
      fecha: '2026-11-03',
      horaInicio: '08:00',
      horaFin: '12:00',
      asistentes: 40,
    });
    expect(error).toMatchObject({
      codigo: 'FRANJA_NO_DISPONIBLE',
      detalles: {
        sugerencias: [
          {
            reservaId: 'r-1',
            espacios: [
              {
                espacioId: 'otro-1',
                codigo: 'B-2',
                nombre: 'Aula B-2',
                capacidadPersonas: 45,
                bloque: 'B',
                sede: 'MOC',
              },
            ],
          },
        ],
      },
    });
  });

  it('un espacio grande para pocos asistentes envía igual, con advertencia y alternativas (RN-18)', async () => {
    const e = crearEntorno({ reservas: [reserva({}, { capacidadPersonas: 200 })] });
    const r = await e.servicio.enviar(SOLICITUD_ID, usuario, CONTEXTO);

    expect(r.estado).toBe('EN_REVISION');
    expect(r.advertencias).toHaveLength(1);
    expect(r.advertencias[0]).toMatchObject({
      codigo: 'ESPACIO_SOBRADO',
      reservaId: 'r-1',
      mensaje: expect.stringContaining('200 personas'),
    });
    expect(r.advertencias[0]?.sugerencias.map((x) => x.codigo)).toEqual(['B-2']);
  });

  it('un espacio ajustado al aforo no genera advertencias', async () => {
    const e = crearEntorno();
    const r = await e.servicio.enviar(SOLICITUD_ID, usuario, CONTEXTO);
    expect(r.advertencias).toEqual([]);
  });

  it('el aforo excedido incluye espacios donde sí caben los asistentes', async () => {
    const e = crearEntorno({ solicitud: borrador({ asistentesEstimados: 200 }) });
    const error = (await rechazo(e.servicio.enviar(SOLICITUD_ID, usuario, CONTEXTO))) as {
      detalles: { problemas: { codigo: string; sugerencias?: { codigo: string }[] }[] };
    };
    const aforo = error.detalles.problemas.find((p) => p.codigo === 'AFORO_EXCEDIDO');
    expect(aforo?.sugerencias?.map((x) => x.codigo)).toEqual(['B-2']);
  });

  it('si la búsqueda de sugerencias falla, el error original se entrega igual', async () => {
    const e = crearEntorno();
    e.busqueda.buscar.mockRejectedValue(new Error('sin base'));
    e.prisma.franjaOcupada.findMany.mockResolvedValue([
      {
        espacioId: ESPACIO_ID,
        inicio: new Date('2026-11-03T14:00:00.000Z'),
        fin: new Date('2026-11-03T15:00:00.000Z'),
      },
    ]);
    const error = await rechazo(e.servicio.enviar(SOLICITUD_ID, usuario, CONTEXTO));
    expect(error).toMatchObject({
      codigo: 'FRANJA_NO_DISPONIBLE',
      detalles: { sugerencias: [{ reservaId: 'r-1', espacios: [] }] },
    });
  });

  it('una carrera (23P01 en la transacción) también da 409', async () => {
    const e = crearEntorno();
    e.prisma.$transaction.mockRejectedValueOnce(
      Object.assign(new Error('exclusion constraint violation'), { code: '23P01' }),
    );
    const error = await rechazo(e.servicio.enviar(SOLICITUD_ID, usuario, CONTEXTO));
    expect(error).toMatchObject({ codigo: 'FRANJA_NO_DISPONIBLE', status: 409 });
  });

  it('un error distinto se propaga', async () => {
    const e = crearEntorno();
    e.prisma.$transaction.mockRejectedValueOnce(new Error('conexión perdida'));
    await expect(e.servicio.enviar(SOLICITUD_ID, usuario, CONTEXTO)).rejects.toThrow('conexión perdida');
  });
});
