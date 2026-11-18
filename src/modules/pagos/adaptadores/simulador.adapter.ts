import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import type { CrearTransaccionEntrada, EstadoTransaccion, EventoInterpretado, PasarelaPort } from '../puertos/pasarela.port.js';

interface OperacionSimulada {
  id: string; referencia: string; valorPesos: number; moneda: 'COP'; estado: EstadoTransaccion;
  urlRetorno: string; ocurrioEn: string;
}
@Injectable()
export class SimuladorAdapter implements PasarelaPort {
  readonly proveedor = 'SIMULADOR' as const;
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {}

  private habilitado(): void {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new ErrorDominio('SIMULADOR_DESACTIVADO', 'El simulador no está disponible en producción.', 503);
    }
  }
  private firmar(valor: string): string {
    this.habilitado();
    const secreto = this.config.get<string>('SIMULADOR_SECRETO');
    if (!secreto || secreto.length < 32) throw new ErrorDominio('PASARELA_SIN_CONFIGURAR', 'Configura el secreto del simulador.', 503);
    return createHmac('sha256', secreto).update(valor, 'utf8').digest('hex');
  }
  private igual(a: string, b: string): boolean {
    return /^[a-f0-9]{64}$/i.test(a) && /^[a-f0-9]{64}$/i.test(b) && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  }
  private base(): URL {
    const base = new URL(`${(this.config.get<string>('SIMULADOR_URL_API') || 'http://127.0.0.1:3001/api').replace(/\/$/, '')}/`);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || !['http:', 'https:'].includes(base.protocol) || base.username || base.password) {
      throw new ErrorDominio('PASARELA_SIN_CONFIGURAR', 'El simulador debe usar la API local.', 503);
    }
    return base;
  }
  async crearTransaccion(entrada: CrearTransaccionEntrada) {
    this.habilitado();
    if (!Number.isSafeInteger(entrada.valorPesos) || entrada.valorPesos <= 0 || entrada.moneda !== 'COP') throw new Error('Valor simulado inválido.');
    const operacion: OperacionSimulada = { id: randomUUID(), referencia: entrada.referencia, valorPesos: entrada.valorPesos,
      moneda: 'COP', estado: 'PENDIENTE', urlRetorno: entrada.urlRetorno, ocurrioEn: new Date().toISOString() };
    const carga = Buffer.from(JSON.stringify({ id: operacion.id, exp: Date.now() + 2 * 3600_000 })).toString('base64url');
    const token = `${carga}.${this.firmar(carga)}`;
    const url = new URL('pagos/checkout/simulador', this.base()); url.searchParams.set('token', token);
    await this.prisma.bitacora.create({ data: { accion: 'SIMULADOR_CREADO', entidad: 'TransaccionSimulada', entidadId: operacion.id,
      datosDespues: { ...operacion } } });
    return { urlCheckout: url.toString(), transaccionExternaId: operacion.id };
  }
  private idToken(token: string): string {
    const [carga, firma, extra] = token.split('.');
    if (!carga || !firma || extra || !this.igual(this.firmar(carga), firma)) throw new ErrorDominio('CHECKOUT_INVALIDO', 'El enlace de simulación no es válido.', 401);
    try {
      const datos = JSON.parse(Buffer.from(carga, 'base64url').toString('utf8')) as { id?: unknown; exp?: unknown };
      if (typeof datos.id !== 'string' || typeof datos.exp !== 'number' || datos.exp <= Date.now()) throw new Error();
      return datos.id;
    } catch { throw new ErrorDominio('CHECKOUT_VENCIDO', 'El enlace de simulación venció.', 409); }
  }
  private async operacion(id: string): Promise<OperacionSimulada> {
    this.habilitado();
    const fila = await this.prisma.bitacora.findFirst({ where: { entidad: 'TransaccionSimulada', entidadId: id,
      accion: { in: ['SIMULADOR_CREADO', 'SIMULADOR_ESTADO'] } }, orderBy: { id: 'desc' } });
    if (!fila) throw new ErrorDominio('NO_ENCONTRADO', 'La transacción simulada no existe.', 404);
    return fila.datosDespues as unknown as OperacionSimulada;
  }
  private evento(operacion: OperacionSimulada): EventoInterpretado {
    const identidad = createHash('sha256').update(`${operacion.id}:${operacion.estado}`).digest('hex');
    return { idEventoExterno: identidad, referencia: operacion.referencia, estado: operacion.estado,
      valorPesos: operacion.valorPesos, transaccionExternaId: operacion.id, ocurrioEn: new Date(operacion.ocurrioEn) };
  }
  async pagina(token: string): Promise<string> {
    await this.operacion(this.idToken(token));
    const seguro = token.replace(/[^A-Za-z0-9_.-]/g, '');
    return `<!doctype html><html lang="es"><meta charset="utf-8"><title>Simulador SIRA</title><body><h1>Simulador de pago</h1><p>Prueba local; no mueve dinero.</p><form method="post" action="simulador"><input type="hidden" name="token" value="${seguro}"><button name="estado" value="APROBADA">Aprobar</button><button name="estado" value="RECHAZADA">Rechazar</button><button name="estado" value="PENDIENTE">Dejar pendiente</button></form></body></html>`;
  }
  async elegir(token: string, estado: string): Promise<string> {
    const id = this.idToken(token);
    if (!['APROBADA', 'RECHAZADA', 'PENDIENTE'].includes(estado)) throw new ErrorDominio('ESTADO_INVALIDO', 'Elige un estado permitido.', 422);
    await this.prisma.$transaction(async (tx) => {
      // La bitácora es inmutable; el bloqueo serializa los cambios del mismo pago simulado.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))::text`;
      const fila = await tx.bitacora.findFirst({ where: { entidad: 'TransaccionSimulada', entidadId: id,
        accion: { in: ['SIMULADOR_CREADO', 'SIMULADOR_ESTADO'] } }, orderBy: { id: 'desc' } });
      if (!fila) throw new ErrorDominio('NO_ENCONTRADO', 'La transacción no existe.', 404);
      const anterior = fila.datosDespues as unknown as OperacionSimulada;
      if (anterior.estado !== 'PENDIENTE' && anterior.estado !== estado) throw new ErrorDominio('TRANSACCION_RESUELTA', 'Este intento ya fue resuelto.', 409);
      if (anterior.estado === 'PENDIENTE' && estado !== 'PENDIENTE') {
        await tx.bitacora.create({ data: { accion: 'SIMULADOR_ESTADO', entidad: 'TransaccionSimulada', entidadId: id,
          datosDespues: { ...anterior, estado, ocurrioEn: new Date().toISOString() } } });
      }
    });
    const operacion = await this.operacion(id);
    const cuerpo = JSON.stringify(this.evento(operacion));
    const respuesta = await fetch(new URL('pagos/webhooks/simulador', this.base()), { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-simulador-firma': this.firmar(cuerpo) }, body: cuerpo,
      signal: AbortSignal.timeout(8000), redirect: 'error' });
    if (!respuesta.ok) throw new ErrorDominio('WEBHOOK_NO_RECIBIDO', 'No se recibió el evento; vuelve a enviar el mismo estado.', 503);
    return operacion.urlRetorno;
  }
  verificarFirmaWebhook(crudo: string, cabeceras: Record<string, string>): boolean {
    try { return this.igual(this.firmar(crudo), cabeceras['x-simulador-firma'] || ''); } catch { return false; }
  }
  interpretarEvento(cuerpo: unknown): EventoInterpretado {
    this.habilitado();
    const e = cuerpo as EventoInterpretado;
    if (!e || typeof e.transaccionExternaId !== 'string' || typeof e.referencia !== 'string' ||
        !['APROBADA', 'RECHAZADA', 'PENDIENTE'].includes(e.estado) || !Number.isSafeInteger(e.valorPesos) || e.valorPesos <= 0 ||
        typeof e.idEventoExterno !== 'string' || !Number.isFinite(new Date(e.ocurrioEn).getTime())) throw new Error('Evento simulado inválido.');
    return { ...e, ocurrioEn: new Date(e.ocurrioEn) };
  }
  async consultarTransaccion(id: string): Promise<EventoInterpretado> { return this.evento(await this.operacion(id)); }
  async consultarPorReferencia(referencia: string): Promise<EventoInterpretado | null> {
    this.habilitado();
    const fila = await this.prisma.bitacora.findFirst({ where: { entidad: 'TransaccionSimulada', accion: 'SIMULADOR_CREADO',
      datosDespues: { path: ['referencia'], equals: referencia } }, orderBy: { id: 'desc' } });
    return fila?.entidadId ? this.consultarTransaccion(fila.entidadId) : null;
  }
  async consultarEstado(id: string): Promise<EstadoTransaccion> { return (await this.consultarTransaccion(id)).estado; }
  async reembolsar(id: string, _valorPesos?: number) { this.habilitado(); await this.operacion(id); return { id: `simulado-${id}`, estado: 'SIMULADO_SIN_DINERO' }; }
}
