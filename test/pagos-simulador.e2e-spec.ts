import { randomInt, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/shared/prisma/prisma.service.js';
import { SesionService } from '../src/modules/identidad/services/sesion.service.js';
import { PasarelaService } from '../src/modules/pagos/services/pasarela.service.js';
import type { crearAppPrueba } from './utilidades/app-prueba.js';

describe.sequential('Pago simulado por HTTP, webhook y procesador reales', () => {
  let app: Awaited<ReturnType<typeof crearAppPrueba>>;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let perfilId: string; let token: string; let espacioId: string; let contador = 0;
  const fechaBase = new Date(Date.now() + (365 + randomInt(3650)) * 86400_000);
  fechaBase.setUTCHours(13, 0, 0, 0); // 08:00 en America/Bogota, independiente de la zona del proceso.
  const anteriores = { proveedor: process.env.PASARELA_PROVEEDOR, secreto: process.env.SIMULADOR_SECRETO,
    url: process.env.SIMULADOR_URL_API, entorno: process.env.NODE_ENV };
  beforeAll(async () => {
    process.env.NODE_ENV = 'test'; process.env.PASARELA_PROVEEDOR = 'simulador';
    process.env.SIMULADOR_SECRETO = 'secreto-exclusivo-e2e-simulador-0123456789';
    // AppModule valida y captura la configuración al importarse, antes de crear la app.
    const { crearAppPrueba } = await import('./utilidades/app-prueba.js');
    app = await crearAppPrueba(); await app.listen(0, '127.0.0.1');
    app.get(ConfigService).set('SIMULADOR_URL_API', `${await app.getUrl()}/api`);
    http = request(app.getHttpServer()); prisma = app.get(PrismaService);
    const id = randomUUID();
    const usuario = await prisma.usuario.create({ data: { correo: `sim-${id}@example.com`, hashContrasena: 'sin-login-por-contrasena',
      correoVerificado: true, roles: { create: { rol: 'SOLICITANTE' } }, solicitante: { create: { tipo: 'PERSONA_NATURAL',
        nombres: 'Simulación E2E', tipoDocumento: 'CC', numeroDocumento: id, telefono: '3000000000' } } }, include: { solicitante: true } });
    perfilId = usuario.solicitante!.id;
    token = (await app.get(SesionService).iniciar(usuario.id, { ip: null, userAgent: 'e2e-simulador' })).accessToken;
    const base = await prisma.espacio.findFirstOrThrow({ where: { archivadoEn: null } });
    // Cada corrida posee su espacio: ni datos antiguos ni otros e2e comparten sus franjas.
    const espacio = await prisma.espacio.create({ data: {
      bloqueId: base.bloqueId, tipoEspacioId: base.tipoEspacioId,
      codigo: `SIM-${id}`, nombre: 'Espacio simulador E2E', capacidadPersonas: 1,
      requiereAval: false,
      horarios: { create: Array.from({ length: 7 }, (_, diaSemana) => ({ diaSemana, abre: '08:00', cierra: '18:00' })) },
    } });
    espacioId = espacio.id;
    await prisma.parametro.upsert({ where: { clave: 'cuenta_recaudo' }, update: {}, create: { clave: 'cuenta_recaudo',
      valor: { banco: 'Prueba', tipo: 'Ahorros', numero: '000', titular: 'SIRA', nit: '000' } } });
  });
  afterAll(async () => {
    try {
      if (prisma && espacioId) {
        // Solo se eliminan las ocupaciones y el espacio propios, incluso si un caso falla.
        await prisma.$transaction(async (tx) => {
          await tx.franjaOcupada.deleteMany({ where: { espacioId } });
          await tx.reservaItem.deleteMany({ where: { espacioId } });
          await tx.horarioOperacion.deleteMany({ where: { espacioId } });
          await tx.espacio.delete({ where: { id: espacioId } });
        });
      }
    } finally {
      try {
        await app?.close();
      } finally {
        for (const [clave, valor] of Object.entries({ PASARELA_PROVEEDOR: anteriores.proveedor, SIMULADOR_SECRETO: anteriores.secreto,
          SIMULADOR_URL_API: anteriores.url, NODE_ENV: anteriores.entorno })) {
          if (valor === undefined) delete process.env[clave]; else process.env[clave] = valor;
        }
      }
    }
  });
  async function cotizada(exenta = false) {
    const inicio = new Date(fechaBase.getTime() + (++contador) * 86400_000);
    const fin = new Date(inicio.getTime() + 3600_000); const plazo = new Date(Date.now() + 86400_000);
    const solicitud = await prisma.solicitud.create({ data: { solicitanteId: perfilId, objetoEvento: 'Simulación', asistentesEstimados: 1,
      tipoTarifa: 'PERSONA_NATURAL', estado: 'COTIZADA', esExenta: exenta, venceEn: plazo,
      reservas: { create: { espacioId, inicio, fin, franja: { create: { espacioId, inicio, fin, estado: 'RETENIDA', origen: 'RESERVA', retenidaHasta: plazo } } } },
      cotizaciones: { create: { consecutivo: `COT-SIM-${randomUUID()}`, subtotal: 10000, total: 10000,
        depositoGarantia: 0, validaHasta: plazo, desglose: {}, esExenta: exenta } } } });
    return solicitud.id;
  }
  async function checkout(solicitudId: string) {
    const orden = await http.post('/api/pagos/ordenes').auth(token, { type: 'bearer' }).send({ solicitudId });
    expect(orden.status).toBe(201);
    const enlace = await http.post(`/api/pagos/ordenes/${orden.body.id}/pasarela`).auth(token, { type: 'bearer' });
    expect(enlace.status).toBe(201);
    return { ordenId: orden.body.id as string, url: new URL(enlace.body.urlCheckout as string) };
  }
  async function elegir(url: URL, estado: string) {
    const resultado = await http.post(url.pathname).type('form').send({ token: url.searchParams.get('token'), estado });
    expect(resultado.status).toBe(303);
    await app.get(PasarelaService).procesarPendientes();
  }
  it('cotizada -> orden -> checkout -> aprobar -> webhook -> confirmada, sin duplicados', async () => {
    const solicitudId = await cotizada(); const pago = await checkout(solicitudId);
    expect((await http.get(`${pago.url.pathname}${pago.url.search}`)).status).toBe(200);
    await elegir(pago.url, 'APROBADA');
    const orden = await prisma.ordenPago.findUniqueOrThrow({ where: { id: pago.ordenId } });
    expect(orden.estado).toBe('APROBADA');
    expect((await prisma.solicitud.findUniqueOrThrow({ where: { id: solicitudId } })).estado).toBe('CONFIRMADA');
    const cantidad = await prisma.historialEstadoSolicitud.count({ where: { solicitudId, estadoNuevo: 'CONFIRMADA' } });
    await elegir(pago.url, 'APROBADA');
    expect(await prisma.historialEstadoSolicitud.count({ where: { solicitudId, estadoNuevo: 'CONFIRMADA' } })).toBe(cantidad);
    expect(await prisma.eventoPasarela.count({ where: { ordenPagoId: pago.ordenId } })).toBe(1);
  });
  it('rechazo -> nuevo intento con nueva referencia -> aprobación', async () => {
    const solicitudId = await cotizada(); const pago = await checkout(solicitudId);
    await elegir(pago.url, 'RECHAZADA');
    expect((await prisma.ordenPago.findUniqueOrThrow({ where: { id: pago.ordenId } })).estado).toBe('RECHAZADA');
    const segundo = await http.post(`/api/pagos/ordenes/${pago.ordenId}/pasarela`).auth(token, { type: 'bearer' });
    expect(segundo.status).toBe(201); expect(segundo.body.urlCheckout).not.toBe(pago.url.toString());
    await elegir(new URL(segundo.body.urlCheckout as string), 'APROBADA');
    expect((await prisma.ordenPago.findUniqueOrThrow({ where: { id: pago.ordenId } })).estado).toBe('APROBADA');
  });
  it('una exenta no genera orden ni checkout', async () => {
    const solicitudId = await cotizada(true);
    const resultado = await http.post('/api/pagos/ordenes').auth(token, { type: 'bearer' }).send({ solicitudId });
    expect(resultado.status).toBe(422); expect(resultado.body.codigo).toBe('SOLICITUD_EXENTA');
  });
});
