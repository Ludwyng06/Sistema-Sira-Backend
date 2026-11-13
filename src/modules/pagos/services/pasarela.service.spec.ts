import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { EventoInterpretado, PasarelaPort, RegistroPasarelas } from '../puertos/pasarela.port.js';
import { PasarelaService } from './pasarela.service.js';

const usuario: UsuarioAutenticado = { id: 'usuario-1', correo: 'ana@ejemplo.com', roles: ['SOLICITANTE'],
  dependencias: [], correoVerificado: true, esInstitucional: false };
const evento: EventoInterpretado = { idEventoExterno: 'evento-1', referencia: 'OP-2026-000001', estado: 'APROBADA',
  valorPesos: 350000, transaccionExternaId: 'wompi-1', ocurrioEn: new Date('2026-11-12T12:00:00Z') };

function entorno() {
  const solicitud = { id: 'solicitud-1', estado: 'PAGO_PENDIENTE', esExenta: false, solicitanteId: 'perfil-1', reservas: [{ id: 'reserva-1' }] };
  const orden = { id: 'orden-1', referencia: evento.referencia, valor: 350000, estado: 'PENDIENTE', medio: 'PASARELA',
    pasarela: 'WOMPI' as string | null, transaccionExternaId: null as string | null, pagadoEn: null,
    soporteUrl: null, venceEn: new Date(Date.now() + 3600_000),
    cotizacion: { solicitudId: solicitud.id, esExenta: false, solicitud } };
  const procesados = new Set<string>();
  const registros: { accion: string; entidadId: string; datosDespues: Record<string, unknown> }[] = [];
  const bitacora = {
    create: vi.fn(async ({ data }: { data: { accion: string; entidadId: string; datosDespues: Record<string, unknown> } }) => {
      registros.push(data); return data;
    }),
    findFirst: vi.fn(async ({ where }: { where: { entidadId?: string; datosDespues?: { equals?: string } } }) => {
      const intentos = registros.filter((fila) => ['CHECKOUT_INICIADO', 'CHECKOUT_REINTENTADO'].includes(fila.accion));
      return intentos.filter((fila) => where.datosDespues
        ? fila.datosDespues.referenciaIntento === where.datosDespues.equals : fila.entidadId === where.entidadId).at(-1) ?? null;
    }),
  };
  const tx = {
    ordenPago: {
      findUnique: vi.fn(async ({ where }: { where: { referencia?: string; id?: string } }) =>
        where.referencia && where.referencia !== orden.referencia ? null : orden),
      findUniqueOrThrow: vi.fn(async () => orden),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { Object.assign(orden, data); return orden; }),
      updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { Object.assign(orden, data); return { count: 1 }; }),
    },
    solicitud: { update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    eventoPasarela: { updateMany: vi.fn(async ({ where }: { where: { id: string } }) => {
      if (procesados.has(where.id)) return { count: 0 };
      procesados.add(where.id); return { count: 1 };
    }) },
    franjaOcupada: { updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([{ id: 'franja-1', espacioId: 'espacio-1', inicio: new Date(), fin: new Date() }]),
      findFirst: vi.fn().mockResolvedValue(null) },
    historialEstadoSolicitud: { create: vi.fn().mockResolvedValue({}) },
    bitacora,
    reembolso: { create: vi.fn().mockResolvedValue({}) },
    solicitante: { findUniqueOrThrow: vi.fn().mockResolvedValue({ usuarioId: usuario.id }) },
    usuarioRol: { findMany: vi.fn().mockResolvedValue([{ usuarioId: 'tesorero-1' }]) },
    notificacion: { create: vi.fn().mockResolvedValue({}) },
    $executeRaw: vi.fn().mockResolvedValue(0),
  };
  const prisma = {
    bitacora,
    ordenPago: { findFirst: vi.fn(async () => orden as typeof orden | null), findMany: vi.fn().mockResolvedValue([]) },
    eventoPasarela: { create: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $transaction: vi.fn(async (fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const pasarela = { proveedor: 'WOMPI', crearTransaccion: vi.fn().mockResolvedValue({ urlCheckout: 'https://checkout.wompi.co/p/?firmado', transaccionExternaId: null }),
    verificarFirmaWebhook: vi.fn().mockReturnValue(true), interpretarEvento: vi.fn().mockReturnValue(evento) };
  const wompi = { interpretarEvento: pasarela.interpretarEvento, consultarTransaccion: vi.fn().mockResolvedValue({ ...evento }),
    consultarPorReferencia: vi.fn().mockResolvedValue({ ...evento }) };
  const adaptadores = new Map<string, PasarelaPort>([['WOMPI', { ...pasarela, ...wompi } as unknown as PasarelaPort]]);
  const servicio = new PasarelaService(prisma as unknown as PrismaService,
    new ConfigService({ FRONTEND_URL: 'http://localhost:3000', WOMPI_AMBIENTE: 'test' }), pasarela as unknown as PasarelaPort,
    adaptadores as RegistroPasarelas);
  return { servicio, prisma, tx, orden, solicitud, pasarela, wompi, registros, adaptadores };
}

describe('PasarelaService', () => {
  it('reabrir un intento pendiente reutiliza el checkout guardado sin crear otra sesión', async () => {
    const e = entorno();
    const primero = await e.servicio.iniciar('orden-1', usuario);
    const segundo = await e.servicio.iniciar('orden-1', usuario);
    expect(segundo.urlCheckout).toBe(primero.urlCheckout);
    expect(e.pasarela.crearTransaccion).toHaveBeenCalledTimes(1);
    expect(e.registros.at(-1)?.datosDespues).toMatchObject({ urlCheckout: primero.urlCheckout });
  });

  it('elige el adaptador del webhook y conserva el proveedor en la cola', async () => {
    const e = entorno();
    const epayco = { proveedor: 'EPAYCO', verificarFirmaWebhook: vi.fn().mockReturnValue(true),
      interpretarEvento: vi.fn().mockReturnValue({ ...evento, idEventoExterno: 'epayco-1' }) };
    e.adaptadores.set('EPAYCO', epayco as unknown as PasarelaPort);
    await e.servicio.recibir('x_amount=350000.00&x_currency_code=COP', { 'content-type': 'application/x-www-form-urlencoded' }, 'epayco');
    expect(epayco.interpretarEvento).toHaveBeenCalledWith({ x_amount: '350000.00', x_currency_code: 'COP' });
    expect(e.prisma.eventoPasarela.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ proveedor: 'EPAYCO' }) }));
    expect(e.pasarela.verificarFirmaWebhook).not.toHaveBeenCalled();
  });

  it('no admite un webhook de un proveedor para una orden de otro proveedor', async () => {
    const e = entorno();
    await expect(e.servicio.aplicar(evento, 'evento-1', 'EPAYCO')).rejects.toMatchObject({ status: 404 });
    expect(e.orden.estado).toBe('PENDIENTE');
    expect(e.tx.notificacion.create).not.toHaveBeenCalled();
  });

  it('consulta el proveedor guardado en la orden aunque el activo sea otro', async () => {
    const e = entorno(); e.pasarela.proveedor = 'EPAYCO';
    e.prisma.ordenPago.findMany.mockResolvedValue([e.orden]);
    await e.servicio.consultarPendientes();
    expect(e.wompi.consultarPorReferencia).toHaveBeenCalledWith(evento.referencia);
    expect(e.orden.estado).toBe('APROBADA');
  });

  it('procesa eventos del proveedor original aunque el activo sea otro', async () => {
    const e = entorno(); e.pasarela.proveedor = 'EPAYCO';
    e.prisma.eventoPasarela.findMany.mockResolvedValue([{ id: 'evento-1', proveedor: 'WOMPI', cuerpo: { crudo: '{}' } }]);
    await e.servicio.procesarPendientes();
    expect(e.wompi.consultarTransaccion).toHaveBeenCalledWith('wompi-1');
    expect(e.orden.estado).toBe('APROBADA');
  });

  it('rechaza solicitud exenta antes de crear checkout', async () => {
    const e = entorno(); e.solicitud.esExenta = true;
    await expect(e.servicio.iniciar('orden-1', usuario))
      .rejects.toMatchObject({ codigo: 'SOLICITUD_EXENTA', status: 409 });
    expect(e.pasarela.crearTransaccion).not.toHaveBeenCalled();
    expect(e.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza una orden pagada', async () => {
    const e = entorno(); e.orden.estado = 'APROBADA';
    await expect(e.servicio.iniciar('orden-1', usuario))
      .rejects.toMatchObject({ codigo: 'ORDEN_NO_PERMITIDA' });
    expect(e.pasarela.crearTransaccion).not.toHaveBeenCalled();
  });

  it('comprueba el dueño y oculta órdenes ajenas con 404', async () => {
    const e = entorno(); e.prisma.ordenPago.findFirst.mockResolvedValue(null);
    await expect(e.servicio.estado('ajena', usuario)).rejects.toMatchObject({ status: 404 });
    expect(e.prisma.ordenPago.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: 'ajena', cotizacion: { solicitud: { solicitante: { usuarioId: usuario.id } } },
    } }));
  });

  it('iniciar no aprueba el pago ni convierte pesos fuera del adaptador', async () => {
    const e = entorno(); e.orden.pasarela = null;
    await expect(e.servicio.iniciar('orden-1', usuario))
      .resolves.toMatchObject({ ordenPagoId: 'orden-1', transaccionExternaId: null });
    expect(e.pasarela.crearTransaccion).toHaveBeenCalledWith(expect.objectContaining({ valorPesos: 350000,
      urlRetorno: 'http://localhost:3000/pagos/retorno?orden=orden-1' }));
    expect(e.tx.ordenPago.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.not.objectContaining({ estado: 'APROBADA' }) }));
    expect(e.tx.historialEstadoSolicitud.create).not.toHaveBeenCalled();
  });

  it('la página de retorno solo lee', async () => {
    const e = entorno();
    await expect(e.servicio.estado('orden-1', usuario)).resolves.toEqual({ estado: 'PENDIENTE', referencia: evento.referencia, valor: 350000 });
    expect(e.prisma.$transaction).not.toHaveBeenCalled();
    expect(e.wompi.consultarTransaccion).not.toHaveBeenCalled();
  });

  it('firma inválida no interpreta ni persiste el evento', async () => {
    const e = entorno(); e.pasarela.verificarFirmaWebhook.mockReturnValue(false);
    await expect(e.servicio.recibir('crudo', {})).rejects.toMatchObject({ codigo: 'FIRMA_WEBHOOK_INVALIDA' });
    expect(e.pasarela.interpretarEvento).not.toHaveBeenCalled();
    expect(e.prisma.eventoPasarela.create).not.toHaveBeenCalled();
  });

  it('persiste el cuerpo exacto y reconoce repetición por la restricción única', async () => {
    const e = entorno(); const crudo = '{ "event": "transaction.updated" }';
    await expect(e.servicio.recibir(crudo, {})).resolves.toEqual({ recibido: true, duplicado: false });
    expect(e.prisma.eventoPasarela.create).toHaveBeenCalledWith({ data: {
      proveedor: 'WOMPI', idEventoExterno: 'evento-1', cuerpo: { crudo }, firmaValida: true,
    } });
    e.prisma.eventoPasarela.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(e.servicio.recibir(crudo, {})).resolves.toEqual({ recibido: true, duplicado: true });
    expect(e.prisma.$transaction).not.toHaveBeenCalled();
    expect(e.wompi.consultarTransaccion).not.toHaveBeenCalled();
  });

  it('aplica aprobación una sola vez, incluso al repetir la entrega', async () => {
    const e = entorno();
    await e.servicio.aplicar(evento, 'evento-1');
    await e.servicio.aplicar(evento, 'evento-1');
    expect(e.tx.historialEstadoSolicitud.create).toHaveBeenCalledTimes(1);
    expect(e.tx.notificacion.create).toHaveBeenCalledTimes(1);
    expect(e.tx.franjaOcupada.updateMany).toHaveBeenCalledTimes(1);
    expect(e.orden.estado).toBe('APROBADA');
  });

  it('no revierte una aprobación con un evento pendiente antiguo', async () => {
    const e = entorno(); e.orden.estado = 'APROBADA';
    await e.servicio.aplicar({ ...evento, estado: 'PENDIENTE' });
    expect(e.orden.estado).toBe('APROBADA');
    expect(e.tx.notificacion.create).not.toHaveBeenCalled();
  });

  it('valor que no coincide no confirma ni notifica', async () => {
    const e = entorno();
    await expect(e.servicio.aplicar({ ...evento, valorPesos: 1 }))
      .rejects.toMatchObject({ codigo: 'VALOR_NO_COINCIDE', status: 422 });
    expect(e.orden.estado).toBe('PENDIENTE');
    expect(e.tx.historialEstadoSolicitud.create).not.toHaveBeenCalled();
    expect(e.tx.notificacion.create).not.toHaveBeenCalled();
  });

  it('registra e ignora otra transacción para una orden ya vinculada', async () => {
    const e = entorno(); e.orden.transaccionExternaId = 'wompi-otra';
    await e.servicio.aplicar(evento);
    expect(e.orden.transaccionExternaId).toBe('wompi-otra');
    expect(e.tx.bitacora.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ accion: 'EVENTO_PASARELA_IGNORADO' }) }));
    expect(e.tx.notificacion.create).not.toHaveBeenCalled();
  });

  it('usa la referencia obtenida por API e ignora la referencia no firmada del webhook', async () => {
    const e = entorno();
    e.prisma.eventoPasarela.findMany.mockResolvedValue([{ id: 'evento-1', proveedor: 'WOMPI', cuerpo: { crudo: '{}' } }]);
    e.wompi.interpretarEvento.mockReturnValue({ ...evento, referencia: 'orden-ajena' });
    await e.servicio.procesarPendientes();
    expect(e.tx.ordenPago.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { referencia: evento.referencia } }));
    expect(e.orden.estado).toBe('APROBADA');
  });

  it('una falla temporal conserva el evento sin procesar para reintento', async () => {
    const e = entorno();
    e.prisma.eventoPasarela.findMany.mockResolvedValue([{ id: 'evento-1', proveedor: 'WOMPI', cuerpo: { crudo: '{}' } }]);
    e.wompi.consultarTransaccion.mockRejectedValueOnce(new Error('timeout'));
    await e.servicio.procesarPendientes();
    expect(e.prisma.eventoPasarela.updateMany).toHaveBeenCalledWith({
      where: { id: 'evento-1', procesadoEn: null }, data: { error: 'PROCESAMIENTO_NO_DISPONIBLE' },
    });
    expect(e.tx.historialEstadoSolicitud.create).not.toHaveBeenCalled();
  });

  it('consulta activa filtra pendientes antiguos y usa el ID cuando está disponible', async () => {
    const e = entorno(); e.orden.transaccionExternaId = 'wompi-1';
    e.prisma.ordenPago.findMany.mockResolvedValue([e.orden]);
    await e.servicio.consultarPendientes();
    expect(e.prisma.ordenPago.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      estado: 'PENDIENTE', actualizadaEn: { lte: expect.any(Date) },
    }) }));
    expect(e.wompi.consultarTransaccion).toHaveBeenCalledWith('wompi-1');
    expect(e.orden.estado).toBe('APROBADA');
  });

  it('sin webhook ni ID consulta por referencia y aprueba por el mismo camino idempotente', async () => {
    const e = entorno(); e.prisma.ordenPago.findMany.mockResolvedValue([e.orden]);
    await e.servicio.consultarPendientes();
    await e.servicio.consultarPendientes();
    expect(e.wompi.consultarPorReferencia).toHaveBeenCalledWith(evento.referencia);
    expect(e.wompi.consultarTransaccion).toHaveBeenCalledTimes(1);
    expect(e.prisma.ordenPago.findMany.mock.calls[0]![0]).not.toHaveProperty('where.transaccionExternaId');
    expect(e.orden.estado).toBe('APROBADA');
    expect(e.orden.transaccionExternaId).toBe('wompi-1');
    expect(e.tx.notificacion.create).toHaveBeenCalledTimes(1);
  });

  it('referencia sin transacción conserva pendiente sin confirmaciones', async () => {
    const e = entorno(); e.prisma.ordenPago.findMany.mockResolvedValue([e.orden]);
    e.wompi.consultarPorReferencia.mockResolvedValue(null);
    await e.servicio.consultarPendientes();
    expect(e.orden.estado).toBe('PENDIENTE');
    expect(e.orden.transaccionExternaId).toBeNull();
    expect(e.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('la búsqueda por referencia no aplica un valor distinto', async () => {
    const e = entorno(); e.prisma.ordenPago.findMany.mockResolvedValue([e.orden]);
    e.wompi.consultarPorReferencia.mockResolvedValue({ ...evento, valorPesos: 1 });
    await e.servicio.consultarPendientes();
    expect(e.orden.estado).toBe('PENDIENTE');
    expect(e.tx.notificacion.create).not.toHaveBeenCalled();
  });

  it.each(['RECHAZADA', 'ANULADA', 'ERROR'])('permite otro intento después de %s sin reutilizar la referencia', async (estado) => {
    const e = entorno();
    await e.servicio.iniciar('orden-1', usuario);
    e.orden.estado = estado; e.orden.transaccionExternaId = 'wompi-vieja';
    await expect(e.servicio.iniciar('orden-1', usuario)).resolves.toMatchObject({ transaccionExternaId: null });
    expect(e.orden.estado).toBe('PENDIENTE');
    expect(e.orden.transaccionExternaId).toBeNull();
    expect(e.pasarela.crearTransaccion).toHaveBeenLastCalledWith(expect.objectContaining({ referencia: `${evento.referencia}-2` }));
    expect(e.registros.at(-1)).toMatchObject({ accion: 'CHECKOUT_REINTENTADO', entidadId: 'orden-1',
      datosDespues: { numeroIntento: 2, referenciaIntento: `${evento.referencia}-2`, transaccionAnteriorId: 'wompi-vieja' } });
    await e.servicio.iniciar('orden-1', usuario);
    expect(e.pasarela.crearTransaccion).toHaveBeenLastCalledWith(expect.objectContaining({ referencia: `${evento.referencia}-2` }));
  });

  it('un intento rechazado vencido sigue siendo no pagable con 409', async () => {
    const e = entorno(); e.orden.estado = 'RECHAZADA'; e.orden.venceEn = new Date(0);
    await expect(e.servicio.iniciar('orden-1', usuario)).rejects.toMatchObject({ codigo: 'ORDEN_NO_PERMITIDA', status: 409 });
    expect(e.pasarela.crearTransaccion).not.toHaveBeenCalled();
  });

  it('una orden sin valor responde 409 antes de pedir checkout', async () => {
    const e = entorno(); e.orden.valor = 0;
    await expect(e.servicio.iniciar('orden-1', usuario)).rejects.toMatchObject({ codigo: 'ORDEN_NO_PERMITIDA', status: 409 });
    expect(e.pasarela.crearTransaccion).not.toHaveBeenCalled();
  });

  it('mapea y concilia la referencia del segundo intento aunque no haya webhook', async () => {
    const e = entorno(); await e.servicio.iniciar('orden-1', usuario);
    e.orden.estado = 'RECHAZADA'; await e.servicio.iniciar('orden-1', usuario);
    e.wompi.consultarPorReferencia.mockResolvedValue({ ...evento, referencia: `${evento.referencia}-2`, transaccionExternaId: 'wompi-2' });
    e.prisma.ordenPago.findMany.mockResolvedValue([e.orden]);
    await e.servicio.consultarPendientes();
    expect(e.wompi.consultarPorReferencia).toHaveBeenCalledWith(`${evento.referencia}-2`);
    expect(e.orden.estado).toBe('APROBADA');
    expect(e.orden.transaccionExternaId).toBe('wompi-2');
  });

  it('un evento anterior se guarda e ignora antes y después de aprobar el nuevo intento', async () => {
    const e = entorno(); await e.servicio.iniciar('orden-1', usuario);
    e.orden.estado = 'RECHAZADA'; e.orden.transaccionExternaId = 'wompi-1';
    await e.servicio.iniciar('orden-1', usuario);
    await e.servicio.aplicar(evento, 'viejo-1');
    expect(e.orden.estado).toBe('PENDIENTE');
    expect(e.orden.transaccionExternaId).toBeNull();
    await e.servicio.aplicar({ ...evento, referencia: `${evento.referencia}-2`, transaccionExternaId: 'wompi-2' }, 'nuevo-2');
    await e.servicio.aplicar({ ...evento, estado: 'RECHAZADA' }, 'viejo-3');
    expect(e.orden.estado).toBe('APROBADA');
    expect(e.orden.transaccionExternaId).toBe('wompi-2');
    expect(e.tx.eventoPasarela.updateMany).toHaveBeenCalledTimes(3);
    expect(e.tx.notificacion.create).toHaveBeenCalledTimes(1);
    expect(e.registros.filter((fila) => fila.accion === 'EVENTO_PASARELA_IGNORADO')).toHaveLength(2);
  });

  it('pago tardío recupera franjas libres y confirma usando la máquina de estados', async () => {
    const e = entorno(); e.solicitud.estado = 'VENCIDA'; e.orden.estado = 'VENCIDA';
    await e.servicio.aplicar(evento);
    expect(e.tx.solicitud.update).toHaveBeenCalledWith(expect.objectContaining({ data: { estado: 'CONFIRMADA', venceEn: null } }));
    expect(e.tx.reembolso.create).not.toHaveBeenCalled();
    expect(e.tx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('pago tardío con choque solicita reembolso y avisa a tesorería sin confirmar reserva', async () => {
    const e = entorno(); e.solicitud.estado = 'VENCIDA'; e.orden.estado = 'VENCIDA';
    e.tx.franjaOcupada.findFirst.mockResolvedValue({ id: 'ocupada' });
    await e.servicio.aplicar(evento);
    expect(e.tx.reembolso.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ valor: 350000 }) }));
    expect(e.tx.historialEstadoSolicitud.create).not.toHaveBeenCalled();
    expect(e.tx.notificacion.create).toHaveBeenCalledTimes(2);
  });

  it('una carrera en la exclusión SQL revierte solo la recuperación y registra reembolso', async () => {
    const e = entorno(); e.solicitud.estado = 'VENCIDA'; e.orden.estado = 'VENCIDA';
    e.tx.franjaOcupada.updateMany.mockRejectedValueOnce(Object.assign(new Error('sin_solapamiento'), { code: '23P01' }));
    await e.servicio.aplicar(evento);
    expect(e.tx.$executeRaw).toHaveBeenCalledTimes(3);
    expect(e.tx.reembolso.create).toHaveBeenCalledTimes(1);
    expect(e.tx.historialEstadoSolicitud.create).not.toHaveBeenCalled();
    expect(e.orden.estado).toBe('APROBADA');
  });
});
