import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ErrorDominio, noEncontrado } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { transicionOConflicto } from '../../reservas/dominio/maquina-estados.js';
import type { CheckoutPasarelaDto, EstadoPagoDto, EventoRecibidoDto } from '../dto/pasarela.dto.js';
import { PASARELA, PASARELAS, type EventoInterpretado, type PasarelaSeleccionada, type RegistroPasarelas } from '../puertos/pasarela.port.js';

const ACCIONES_INTENTO = ['CHECKOUT_INICIADO', 'CHECKOUT_REINTENTADO'];
const ESTADOS_REINTENTABLES: readonly string[] = ['RECHAZADA', 'ANULADA', 'ERROR'];

@Injectable()
export class PasarelaService {
  private readonly logger = new Logger(PasarelaService.name);
  private procesando = false;
  private conciliando = false;
  private ultimoEventoId: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(PASARELA) private readonly pasarela: PasarelaSeleccionada,
    @Inject(PASARELAS) private readonly adaptadores: RegistroPasarelas,
  ) {}

  private adaptador(proveedor: string) {
    const adaptador = this.adaptadores.get(proveedor.toUpperCase());
    if (!adaptador) throw noEncontrado('La pasarela');
    return adaptador;
  }

  private interpretarCuerpo(crudo: string): unknown {
    if (crudo.trimStart().startsWith('{')) return JSON.parse(crudo);
    const campos: Record<string, string> = {};
    for (const [clave, valor] of new URLSearchParams(crudo)) {
      if (Object.hasOwn(campos, clave) || ['__proto__', 'constructor', 'prototype'].includes(clave)) throw new Error('Campo duplicado.');
      campos[clave] = valor;
    }
    return campos;
  }

  private ordenPropia(id: string, usuario: UsuarioAutenticado) {
    return this.prisma.ordenPago.findFirst({
      where: { id, cotizacion: { solicitud: { solicitante: { usuarioId: usuario.id } } } },
      include: { cotizacion: { include: { solicitud: true } } },
    });
  }

  async iniciar(id: string, usuario: UsuarioAutenticado): Promise<CheckoutPasarelaDto> {
    const orden = await this.ordenPropia(id, usuario);
    if (!orden) throw noEncontrado('La orden de pago');
    if (orden.cotizacion.esExenta || orden.cotizacion.solicitud.esExenta) {
      throw new ErrorDominio('SOLICITUD_EXENTA', 'Esta solicitud es exenta: no requiere pago.', 409);
    }
    if ((orden.estado !== 'PENDIENTE' && !ESTADOS_REINTENTABLES.includes(orden.estado)) ||
        orden.soporteUrl || orden.venceEn <= new Date() || orden.valor <= 0 ||
        orden.cotizacion.solicitud.estado !== 'PAGO_PENDIENTE') {
      throw new ErrorDominio('ORDEN_NO_PERMITIDA', 'Solo puedes pagar una orden pendiente o reintentable y vigente.', 409);
    }
    const retorno = new URL('/pagos/retorno', this.config.getOrThrow<string>('FRONTEND_URL'));
    retorno.searchParams.set('orden', id);
    return this.prisma.$transaction(async (tx) => {
      // Misma guarda por solicitud que los casos de pago manual y vencimiento.
      const solicitud = await tx.solicitud.updateMany({
        where: { id: orden.cotizacion.solicitudId, estado: 'PAGO_PENDIENTE', esExenta: false },
        data: { actualizadoEn: new Date() },
      });
      if (!solicitud.count) throw new ErrorDominio('ORDEN_NO_PERMITIDA', 'La solicitud cambió de estado.', 409);
      const actual = await tx.ordenPago.findUniqueOrThrow({ where: { id } });
      const reintento = ESTADOS_REINTENTABLES.includes(actual.estado);
      if ((actual.estado !== 'PENDIENTE' && !reintento) || actual.soporteUrl || actual.venceEn <= new Date() || actual.valor <= 0) {
        throw new ErrorDominio('ORDEN_NO_PERMITIDA', 'La orden cambió de estado.', 409);
      }
      const pasarela = actual.pasarela ? this.adaptador(actual.pasarela) : this.pasarela;
      const anterior = await this.ultimoIntento(tx, id, actual.referencia, pasarela.proveedor);
      const numeroIntento = anterior.numero + (reintento ? 1 : 0);
      const referenciaIntento = reintento ? `${actual.referencia}-${numeroIntento}` : anterior.referencia;
      // Algunos proveedores crean sesión por HTTP; el timeout transaccional acota el bloqueo.
      const reutilizar = !reintento && anterior.urlCheckout;
      const checkout = reutilizar ? { urlCheckout: reutilizar, transaccionExternaId: actual.transaccionExternaId }
        : await pasarela.crearTransaccion({
        referencia: referenciaIntento, valorPesos: actual.valor, moneda: 'COP',
        correoPagador: usuario.correo, urlRetorno: retorno.toString(), descripcion: `Orden ${actual.referencia}`,
      });
      const primeraApertura = actual.pasarela === null;
      const transaccionAnteriorId = actual.transaccionExternaId;
      const gracia = new Date(Math.max(actual.venceEn.getTime(), Date.now() + this.minutos('PASARELA_GRACIA_MINUTOS', 120) * 60_000));
      const cambio = await tx.ordenPago.updateMany({
        where: { id, estado: actual.estado, soporteUrl: null, transaccionExternaId: actual.transaccionExternaId },
        data: { medio: 'PASARELA', pasarela: pasarela.proveedor,
          ...(!reintento && !actual.transaccionExternaId && checkout.transaccionExternaId
            ? { transaccionExternaId: checkout.transaccionExternaId } : {}),
          ...(reintento ? { estado: 'PENDIENTE' as const, transaccionExternaId: checkout.transaccionExternaId, pagadoEn: null } : {}),
          ...(primeraApertura ? { venceEn: gracia } : {}) },
      });
      if (!cambio.count) throw new ErrorDominio('ORDEN_NO_PERMITIDA', 'La orden cambió de estado.', 409);
      if (primeraApertura) {
        await tx.solicitud.update({ where: { id: orden.cotizacion.solicitudId }, data: { venceEn: gracia } });
        await tx.franjaOcupada.updateMany({
          where: { reservaItem: { solicitudId: orden.cotizacion.solicitudId }, estado: 'RETENIDA' },
          data: { retenidaHasta: gracia },
        });
      }
      await tx.bitacora.create({ data: {
        usuarioId: usuario.id, accion: reintento ? 'CHECKOUT_REINTENTADO' : 'CHECKOUT_INICIADO', entidad: 'OrdenPago', entidadId: id,
        datosDespues: { proveedor: pasarela.proveedor, referencia: actual.referencia,
          referenciaIntento, numeroIntento, ambiente: this.config.get<string>(`${pasarela.proveedor}_AMBIENTE`) || 'test',
          urlCheckout: checkout.urlCheckout, checkoutCreadoEn: reutilizar ? anterior.checkoutCreadoEn : Date.now(),
          transaccionAnteriorId: reintento ? transaccionAnteriorId : null },
      } });
      return { ordenPagoId: id, urlCheckout: checkout.urlCheckout,
        transaccionExternaId: checkout.transaccionExternaId ?? (reintento ? null : actual.transaccionExternaId) };
    }, { timeout: 30_000 });
  }

  /** Bitácora inmutable como registro de intentos, serializado por el bloqueo de solicitud. */
  private async ultimoIntento(cliente: Pick<Prisma.TransactionClient, 'bitacora'>, id: string, referencia: string, proveedor: string) {
    const fila = await cliente.bitacora.findFirst({
      where: { entidad: 'OrdenPago', entidadId: id, accion: { in: ACCIONES_INTENTO } },
      orderBy: { id: 'desc' }, select: { datosDespues: true },
    });
    const datos = fila?.datosDespues as Record<string, unknown> | null;
    const numero = typeof datos?.numeroIntento === 'number' ? datos.numeroIntento : 1;
    const ref = typeof datos?.referenciaIntento === 'string' ? datos.referenciaIntento : referencia;
    const ambiente = typeof datos?.ambiente === 'string' ? datos.ambiente : 'test';
    if (fila && (ambiente !== (this.config.get<string>(`${proveedor}_AMBIENTE`) || 'test') ||
        (typeof datos?.proveedor === 'string' && datos.proveedor !== proveedor))) {
      throw new ErrorDominio('AMBIENTE_NO_COINCIDE', 'La orden pertenece a otro ambiente de pagos.', 409);
    }
    return { numero, referencia: ref,
      urlCheckout: typeof datos?.urlCheckout === 'string' ? datos.urlCheckout : null,
      checkoutCreadoEn: typeof datos?.checkoutCreadoEn === 'number' ? datos.checkoutCreadoEn : 0 };
  }

  async estado(id: string, usuario: UsuarioAutenticado): Promise<EstadoPagoDto> {
    // La página de retorno solo lee datos locales; no acepta estado ni ID del navegador.
    const orden = await this.ordenPropia(id, usuario);
    if (!orden) throw noEncontrado('La orden de pago');
    if (orden.cotizacion.esExenta || orden.cotizacion.solicitud.esExenta) {
      throw new ErrorDominio('SOLICITUD_EXENTA', 'Esta solicitud es exenta: no requiere pago.', 422);
    }
    return { referencia: orden.referencia, estado: orden.estado, valor: orden.valor };
  }

  async recibir(crudo: string, cabeceras: Record<string, string>, proveedor = 'wompi'): Promise<EventoRecibidoDto> {
    const pasarela = this.adaptador(proveedor);
    if (!pasarela.verificarFirmaWebhook(crudo, cabeceras)) {
      throw new ErrorDominio('FIRMA_WEBHOOK_INVALIDA', 'La firma del evento no es válida.', 401);
    }
    let evento: EventoInterpretado;
    try { evento = pasarela.interpretarEvento(this.interpretarCuerpo(crudo)); }
    catch { throw new ErrorDominio('EVENTO_INVALIDO', 'El evento de pago no es válido.', 422); }
    try {
      // Cola durable en EventoPasarela: no hay llamadas HTTP ni correos en esta petición.
      await this.prisma.eventoPasarela.create({ data: {
        proveedor: pasarela.proveedor, idEventoExterno: evento.idEventoExterno,
        cuerpo: { crudo }, firmaValida: true,
      } });
      return { recibido: true, duplicado: false };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') return { recibido: true, duplicado: true };
      throw error;
    }
  }

  @Cron('*/10 * * * * *')
  async procesarPendientes(): Promise<void> {
    if (this.procesando) return;
    this.procesando = true;
    try {
      const eventos = await this.prisma.eventoPasarela.findMany({
        where: { proveedor: { in: [...this.adaptadores.keys()] }, firmaValida: true, procesadoEn: null },
        orderBy: [{ recibidoEn: 'asc' }, { id: 'asc' }], take: 20,
        ...(this.ultimoEventoId ? { cursor: { id: this.ultimoEventoId }, skip: 1 } : {}),
      });
      // Rota el cursor incluso ante fallos: un lote de eventos fallidos no bloquea los nuevos.
      this.ultimoEventoId = eventos.length === 20 ? eventos[eventos.length - 1]!.id : undefined;
      for (const fila of eventos) {
        try {
          const cuerpo = fila.cuerpo as { crudo: string };
          const pasarela = this.adaptador(fila.proveedor);
          const evento = pasarela.interpretarEvento(this.interpretarCuerpo(cuerpo.crudo));
          // reference/currency no están necesariamente firmados por Wompi: se verifican por API.
          const verificado = await pasarela.consultarTransaccion(evento.transaccionExternaId);
          if (verificado.valorPesos !== evento.valorPesos) {
            throw new ErrorDominio('EVENTO_NO_COINCIDE', 'El evento no coincide con la transacción del proveedor.', 422);
          }
          await this.aplicar(verificado, fila.id, pasarela.proveedor);
        } catch (error) {
          const definitivo = error instanceof ErrorDominio && error.status !== 503;
          await this.prisma.eventoPasarela.updateMany({ where: { id: fila.id, procesadoEn: null }, data: {
            error: error instanceof ErrorDominio ? error.codigo : 'PROCESAMIENTO_NO_DISPONIBLE',
            ...(definitivo ? { procesadoEn: new Date() } : {}),
          } });
          this.logger.warn(`Evento ${fila.id}: procesamiento pendiente o rechazado.`);
        }
      }
    } catch (error) {
      this.logger.error('No se pudo procesar la cola de eventos de pasarela.', error instanceof Error ? error.stack : undefined);
    } finally { this.procesando = false; }
  }

  /** RN-12: única escritura de estados de pasarela, compartida por webhook y consulta autenticada. */
  async aplicar(evento: EventoInterpretado, eventoId?: string, proveedor?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Orden de bloqueo: solicitud -> orden -> evento, como pagos y vencimientos existentes.
      let candidata = await tx.ordenPago.findUnique({
        where: { referencia: evento.referencia }, include: { cotizacion: true },
      });
      if (!candidata) {
        // Nunca se deduce la orden quitando sufijos: solo se acepta una referencia guardada.
        const intento = await tx.bitacora.findFirst({ where: {
          entidad: 'OrdenPago', accion: { in: ACCIONES_INTENTO },
          datosDespues: { path: ['referenciaIntento'], equals: evento.referencia },
        }, orderBy: { id: 'desc' }, select: { entidadId: true } });
        if (intento?.entidadId) candidata = await tx.ordenPago.findUnique({
          where: { id: intento.entidadId }, include: { cotizacion: true },
        });
      }
      if (!candidata || !candidata.pasarela || candidata.medio !== 'PASARELA' ||
          (proveedor && candidata.pasarela !== proveedor)) {
        throw noEncontrado('La orden de pago');
      }
      await tx.solicitud.update({ where: { id: candidata.cotizacion.solicitudId }, data: { actualizadoEn: new Date() } });
      await tx.ordenPago.update({ where: { id: candidata.id }, data: { actualizadaEn: new Date() } });
      const orden = await tx.ordenPago.findUniqueOrThrow({ where: { id: candidata.id },
        include: { cotizacion: { include: { solicitud: { include: { reservas: true } } } } },
      });
      if (eventoId) {
        const reclamo = await tx.eventoPasarela.updateMany({
          where: { id: eventoId, procesadoEn: null },
          data: { procesadoEn: new Date(), ordenPagoId: orden.id, error: null },
        });
        if (!reclamo.count) return;
      }
      const vigente = await this.ultimoIntento(tx, orden.id, orden.referencia, candidata.pasarela);
      // El reclamo anterior conserva el evento y su vínculo; ningún intento viejo modifica el actual.
      if (orden.estado === 'APROBADA' || vigente.referencia !== evento.referencia ||
          (orden.transaccionExternaId && orden.transaccionExternaId !== evento.transaccionExternaId)) {
        await tx.bitacora.create({ data: { accion: 'EVENTO_PASARELA_IGNORADO', entidad: 'OrdenPago', entidadId: orden.id,
          datosDespues: { referenciaIntento: evento.referencia, referenciaVigente: vigente.referencia,
            transaccionExternaId: evento.transaccionExternaId, estadoOrden: orden.estado },
        } });
        return;
      }
      if (orden.valor !== evento.valorPesos) throw new ErrorDominio('VALOR_NO_COINCIDE', 'El valor no coincide con la orden.', 422);
      if (orden.cotizacion.esExenta || orden.cotizacion.solicitud.esExenta) {
        throw new ErrorDominio('SOLICITUD_EXENTA', 'Esta solicitud es exenta: no requiere pago.', 422);
      }
      // Un evento antiguo o una consulta concurrente nunca revierte un pago ni repite efectos.
      if (orden.estado === 'RECHAZADA' || orden.estado === 'ANULADA') return;
      const estado = evento.estado === 'ERROR' ? 'RECHAZADA' : evento.estado;
      await tx.ordenPago.update({ where: { id: orden.id }, data: {
        transaccionExternaId: evento.transaccionExternaId,
        ...(estado !== 'PENDIENTE' ? { estado } : {}),
        ...(estado === 'APROBADA' ? { pagadoEn: new Date() } : {}),
      } });
      const solicitud = orden.cotizacion.solicitud;
      let confirmada = false;
      if (estado === 'APROBADA') {
        const tardiaRecuperable = solicitud.estado === 'VENCIDA'
          ? await this.recuperarFranjas(tx, solicitud.reservas.map((r) => r.id)) : false;
        if (solicitud.estado === 'PAGO_PENDIENTE' || tardiaRecuperable) {
          const destino = transicionOConflicto(solicitud.estado,
            tardiaRecuperable ? 'CONFIRMAR_PAGO_TARDIO' : 'CONFIRMAR_PAGO');
          await tx.solicitud.update({ where: { id: solicitud.id }, data: { estado: destino, venceEn: null } });
          await tx.franjaOcupada.updateMany({
            where: { reservaItemId: { in: solicitud.reservas.map((r) => r.id) }, estado: 'RETENIDA' },
            data: { estado: 'CONFIRMADA', retenidaHasta: null },
          });
          await tx.historialEstadoSolicitud.create({ data: {
            solicitudId: solicitud.id, estadoAnterior: solicitud.estado, estadoNuevo: destino,
            observacion: `Pago en línea ${candidata.pasarela} ${orden.referencia}`,
          } });
          confirmada = true;
        } else {
          // No se confirma una reserva liberada sin verificar disponibilidad: conserva el dinero
          // recibido y registra reembolso para tesorería, sin volver a cobrar ni ocupar horarios.
          await tx.reembolso.create({ data: {
            ordenPagoId: orden.id, valor: orden.valor, motivo: `Pago en línea ${candidata.pasarela} recibido fuera del estado de pago; requiere conciliación de tesorería.`,
          } });
          const tesoreria = await tx.usuarioRol.findMany({ where: { rol: 'TESORERIA' }, select: { usuarioId: true } });
          for (const usuarioId of new Set(tesoreria.map((fila) => fila.usuarioId))) {
            await tx.notificacion.create({ data: { usuarioId, titulo: `Pago tardío ${orden.referencia}`,
              cuerpo: 'Pago recibido sin reserva recuperable; revisa el reembolso total solicitado.' } });
          }
        }
      }
      if (estado !== 'PENDIENTE') {
        await tx.bitacora.create({ data: { accion: `PAGO_PASARELA_${estado}`, entidad: 'OrdenPago', entidadId: orden.id,
          datosDespues: { referencia: orden.referencia, transaccionExternaId: evento.transaccionExternaId, valor: orden.valor },
        } });
        // Notificación interna durable y atómica; no se repite correo ante reintentos.
        const solicitante = await tx.solicitante.findUniqueOrThrow({ where: { id: solicitud.solicitanteId } });
        await tx.notificacion.create({ data: { usuarioId: solicitante.usuarioId,
          titulo: `Pago ${estado.toLowerCase()} de ${orden.referencia}`,
          cuerpo: estado === 'APROBADA' && !confirmada
            ? 'Recibimos tu pago fuera del plazo; tesorería revisará el reembolso.'
            : `El proveedor confirmó el estado ${estado.toLowerCase()} de tu pago.`,
        } });
      }
    });
  }

  private async recuperarFranjas(tx: Prisma.TransactionClient, reservas: string[]): Promise<boolean> {
    if (!reservas.length) return false;
    const franjas = await tx.franjaOcupada.findMany({ where: { reservaItemId: { in: reservas } } });
    if (franjas.length !== reservas.length) return false;
    for (const franja of franjas) {
      const choque = await tx.franjaOcupada.findFirst({ where: {
        id: { not: franja.id }, espacioId: franja.espacioId, estado: { not: 'LIBERADA' },
        inicio: { lt: franja.fin }, fin: { gt: franja.inicio },
      }, select: { id: true } });
      if (choque) return false;
    }
    // La exclusión SQL es la última defensa ante una reserva concurrente. Un savepoint
    // permite registrar el dinero y el reembolso aunque esa recuperación entre en conflicto.
    await tx.$executeRaw`SAVEPOINT recuperar_pago_tardio`;
    try {
      await tx.franjaOcupada.updateMany({ where: { id: { in: franjas.map((f) => f.id) } },
        data: { estado: 'CONFIRMADA', retenidaHasta: null } });
      await tx.$executeRaw`RELEASE SAVEPOINT recuperar_pago_tardio`;
      return true;
    } catch (error) {
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT recuperar_pago_tardio`;
      await tx.$executeRaw`RELEASE SAVEPOINT recuperar_pago_tardio`;
      const detalle = `${error instanceof Error ? error.message : String(error)} ${JSON.stringify(error)}`;
      if (detalle.includes('23P01') || detalle.includes('sin_solapamiento')) return false;
      throw error;
    }
  }

  @Cron('0 */10 * * * *')
  async consultarPendientes(): Promise<void> {
    if (this.conciliando) return;
    this.conciliando = true;
    try {
      const ordenes = await this.prisma.ordenPago.findMany({ where: {
        pasarela: { in: [...this.adaptadores.keys()] }, medio: 'PASARELA', estado: 'PENDIENTE',
        actualizadaEn: { lte: new Date(Date.now() - this.minutos('PASARELA_CONSULTA_MINUTOS', 30) * 60_000) },
      }, orderBy: { actualizadaEn: 'asc' }, take: 100 });
      for (const orden of ordenes) {
        try {
          const pasarela = this.adaptador(orden.pasarela!);
          const intento = await this.ultimoIntento(this.prisma, orden.id, orden.referencia, pasarela.proveedor);
          const evento = orden.transaccionExternaId
            ? await pasarela.consultarTransaccion(orden.transaccionExternaId)
            : await pasarela.consultarPorReferencia(intento.referencia);
          if (!evento) continue;
          if (evento.referencia !== intento.referencia) throw new Error('Referencia distinta a la consultada.');
          await this.aplicar(evento, undefined, pasarela.proveedor);
        } catch { this.logger.warn(`No se pudo conciliar la orden ${orden.id}.`); }
      }
    } catch (error) {
      this.logger.error('No se pudo consultar los pagos pendientes.', error instanceof Error ? error.stack : undefined);
    } finally { this.conciliando = false; }
  }

  private minutos(clave: string, defecto: number): number {
    const valor = Number(this.config.get<string | number>(clave) ?? defecto);
    if (!Number.isSafeInteger(valor) || valor < 1 || valor > 1440) throw new Error(`Configuración inválida: ${clave}.`);
    return valor;
  }
}
