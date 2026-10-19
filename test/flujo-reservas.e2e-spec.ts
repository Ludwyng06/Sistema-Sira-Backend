import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Rol } from '../src/generated/prisma/enums.js';
import { RecordatoriosService } from '../src/modules/reservas/jobs/recordatorios.service.js';
import { VencimientosService } from '../src/modules/reservas/jobs/vencimientos.service.js';
import { PrismaService } from '../src/shared/prisma/prisma.service.js';
import { crearAppPrueba } from './utilidades/app-prueba.js';
import { esperarUltimoCorreo } from './utilidades/mailpit.js';

const sufijo = randomUUID().replaceAll('-', '').slice(0, 10);
const CONTRASENA = 'Clave-segura-E2E-2026';
const correoSolicitante = `e2e-reservas-${sufijo}@example.com`;
const PDF = Buffer.from('%PDF-1.7\ncomprobante de consignacion de prueba');

/** Próximo día de la semana indicado (0 = domingo) a más de 25 días, como AAAA-MM-DD. */
function fechaFutura(diaSemana: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 25);
  while (d.getUTCDay() !== diaSemana) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const MIERCOLES = fechaFutura(3);
const JUEVES = fechaFutura(4);
const VIERNES = fechaFutura(5);
const SABADO = fechaFutura(6);
const LUNES = fechaFutura(1);
const MARTES = fechaFutura(2);
const hora = (fecha: string, hhmm: string) => new Date(`${fecha}T${hhmm}:00-05:00`).toISOString();

describe.sequential('UC-01 a UC-05 de punta a punta contra la base real', () => {
  let app: Awaited<ReturnType<typeof crearAppPrueba>>;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;

  const tokens: Record<string, string> = {};
  let espacioId = '';
  let elementoId = '';
  let solicitudId = '';
  let ordenId = '';
  let actaEntregaId = '';

  const auth = (clave: string) => ({ Authorization: `Bearer ${tokens[clave]}` });
  const cuerpo = (res: { body: unknown }) => res.body as Record<string, unknown>;

  async function crearUsuarioInterno(correo: string, roles: { rol: Rol; dependenciaId?: string }[]) {
    const usuario = await prisma.usuario.create({
      data: {
        correo,
        hashContrasena: await argon2.hash(CONTRASENA, { type: argon2.argon2id }),
        correoVerificado: true,
        esInstitucional: true,
        roles: { create: roles.map((r) => ({ rol: r.rol, dependenciaId: r.dependenciaId ?? null })) },
      },
      include: { roles: true },
    });
    const jwt = app.get(JwtService);
    const token = jwt.sign({
      sub: usuario.id,
      correo: usuario.correo,
      roles: [...new Set(usuario.roles.map((r) => r.rol))],
      dependencias: usuario.roles.map((r) => r.dependenciaId).filter((d): d is string => d !== null),
      verificado: true,
      institucional: true,
    });
    return { id: usuario.id, token };
  }

  async function nuevaSolicitud(
    fecha: string,
    desde: string,
    hasta: string,
    quien = 'solicitante',
    extra: Record<string, unknown> = {},
  ): Promise<string> {
    const creada = await http
      .post('/api/solicitudes')
      .set(auth(quien))
      .send({
        objetoEvento: `Evento E2E ${sufijo}`,
        asistentesEstimados: 30,
        eventoPublico: true,
        ...extra,
      });
    expect(creada.status).toBe(201);
    const id = cuerpo(creada).id as string;
    const item = await http
      .post(`/api/solicitudes/${id}/reservas`)
      .set(auth(quien))
      .send({ espacioId, inicio: hora(fecha, desde), fin: hora(fecha, hasta) });
    expect(item.status).toBe(201);
    return id;
  }

  async function aprobarSolicitud(id: string): Promise<void> {
    expect((await http.post(`/api/solicitudes/${id}/enviar`).set(auth('solicitante'))).status).toBe(200);
    for (const [quien, tipo] of [
      ['responsable', 'AVAL'],
      ['aprobador', 'APROBACION'],
    ] as const) {
      const r = await http
        .post(`/api/solicitudes/${id}/decisiones`)
        .set(auth(quien))
        .send({ tipo, resultado: 'APROBADA' });
      expect(r.status).toBe(200);
    }
  }

  beforeAll(async () => {
    app = await crearAppPrueba();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());

    const tipo = await prisma.tipoEspacio.findFirstOrThrow({ where: { activo: true } });
    const bloque = await prisma.bloque.findFirstOrThrow({ where: { activo: true } });
    const dependencia = await prisma.dependencia.create({
      data: { codigo: `E2E${sufijo}`, nombre: `Dependencia E2E ${sufijo}` },
    });

    const responsable = await crearUsuarioInterno(`e2e-resp-${sufijo}@itp.edu.co`, [
      { rol: Rol.RESPONSABLE_ESPACIO },
    ]);
    const aprobador = await crearUsuarioInterno(`e2e-apr-${sufijo}@itp.edu.co`, [
      { rol: Rol.APROBADOR, dependenciaId: dependencia.id },
    ]);
    const tesoreria = await crearUsuarioInterno(`e2e-tes-${sufijo}@itp.edu.co`, [{ rol: Rol.TESORERIA }]);
    const admin = await crearUsuarioInterno(`e2e-adm-${sufijo}@itp.edu.co`, [{ rol: Rol.ADMINISTRADOR }]);
    tokens.responsable = responsable.token;
    tokens.aprobador = aprobador.token;
    tokens.tesoreria = tesoreria.token;
    tokens.admin = admin.token;

    const interno = await prisma.usuario.create({
      data: {
        correo: `e2e-int-${sufijo}@itp.edu.co`,
        hashContrasena: await argon2.hash(CONTRASENA, { type: argon2.argon2id }),
        correoVerificado: true,
        esInstitucional: true,
        roles: { create: [{ rol: Rol.SOLICITANTE }] },
        solicitante: {
          create: {
            tipo: 'INTERNO',
            nombres: 'Docente E2E',
            tipoDocumento: 'CC',
            numeroDocumento: `7${sufijo}`,
            telefono: '+573001234567',
            dependenciaId: dependencia.id,
          },
        },
      },
    });
    tokens.interno = app.get(JwtService).sign({
      sub: interno.id,
      correo: interno.correo,
      roles: ['SOLICITANTE'],
      dependencias: [],
      verificado: true,
      institucional: true,
    });

    const espacio = await prisma.espacio.create({
      data: {
        bloqueId: bloque.id,
        tipoEspacioId: tipo.id,
        dependenciaId: dependencia.id,
        responsableId: responsable.id,
        codigo: `E2E-${sufijo.toUpperCase()}`,
        nombre: `Aula E2E ${sufijo}`,
        capacidadPersonas: 50,
        requiereAval: true,
        minutosMontaje: 30,
        minutosDesmontaje: 15,
      },
    });
    espacioId = espacio.id;
    await prisma.tarifa.create({
      data: {
        espacioId,
        tipoSolicitante: 'EMPRESA',
        unidad: 'HORA',
        valor: 20_000,
        vigenciaDesde: new Date('2020-01-01T00:00:00.000Z'),
      },
    });
    await prisma.tarifa.createMany({
      data: [
        {
          espacioId: espacio.id,
          tipoSolicitante: 'INTERNO',
          unidad: 'HORA',
          valor: 0,
          vigenciaDesde: new Date('2020-01-01T00:00:00.000Z'),
        },
        {
          espacioId: espacio.id,
          tipoSolicitante: 'PERSONA_NATURAL',
          unidad: 'HORA',
          valor: 15_000,
          vigenciaDesde: new Date('2020-01-01T00:00:00.000Z'),
        },
      ],
    });
    const elemento = await prisma.elemento.create({
      data: { espacioId, nombre: 'Videobeam', cantidad: 1 },
    });
    elementoId = elemento.id;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('registra una empresa, verifica el correo y entra con la cookie de refresco', async () => {
    const politica = await prisma.parametro.findUniqueOrThrow({ where: { clave: 'version_politica_datos' } });
    const registro = await http.post('/api/auth/registro').send({
      correo: correoSolicitante,
      contrasena: CONTRASENA,
      tipo: 'EMPRESA',
      nombres: 'Contacto E2E',
      razonSocial: `Empresa E2E ${sufijo}`,
      tipoDocumento: 'NIT',
      numeroDocumento: `9${sufijo}`,
      telefono: '+573001234567',
      aceptaPoliticaDatos: true,
      versionPolitica: politica.valor,
    });
    expect(registro.status).toBe(201);

    const correo = await esperarUltimoCorreo(correoSolicitante);
    const verificado = await http
      .post('/api/auth/verificar-correo')
      .send({ correo: correoSolicitante, codigo: correo.asunto.slice(0, 6) });
    expect(verificado.status).toBe(200);

    const sesion = await http.post('/api/auth/ingresar').send({ correo: correoSolicitante, contrasena: CONTRASENA });
    expect(sesion.status).toBe(200);
    tokens.solicitante = cuerpo(sesion).accessToken as string;
    expect(cuerpo(sesion)).not.toHaveProperty('refreshToken');
    expect(String(sesion.headers['set-cookie'])).toContain('sira_refresh=');
  }, 60_000);

  it('UC-01: crea el borrador, agrega la reserva con valor estimado y la envía a revisión', async () => {
    solicitudId = await nuevaSolicitud(MIERCOLES, '08:00', '12:00');

    const detalle = await http.get(`/api/solicitudes/${solicitudId}`).set(auth('solicitante'));
    expect(detalle.status).toBe(200);
    const reservas = cuerpo(detalle).reservas as { subtotal: number }[];
    expect(reservas).toHaveLength(1);
    expect(reservas[0]?.subtotal).toBe(80_000);

    const enviada = await http.post(`/api/solicitudes/${solicitudId}/enviar`).set(auth('solicitante'));
    expect(enviada.status).toBe(200);
    expect(cuerpo(enviada)).toMatchObject({ estado: 'EN_REVISION', esExenta: false });
    expect(String(cuerpo(enviada).consecutivo)).toMatch(/^SOL-\d{4}-\d{4,}$/);

    const franja = await prisma.franjaOcupada.findFirstOrThrow({
      where: { espacioId, estado: 'RETENIDA' },
    });
    expect(franja.inicio.toISOString()).toBe(hora(MIERCOLES, '07:30'));
    expect(franja.fin.toISOString()).toBe(hora(MIERCOLES, '12:15'));
  });

  it('el calendario público muestra la franja como ocupada sin datos personales', async () => {
    const res = await http.get('/api/disponibilidad').query({
      espacioId,
      desde: hora(MIERCOLES, '00:00'),
      hasta: hora(JUEVES, '00:00'),
    });
    expect(res.status).toBe(200);
    const franjas = cuerpo(res).franjas as Record<string, unknown>[];
    expect(franjas).toHaveLength(1);
    expect(franjas[0]).toMatchObject({ estado: 'RETENIDA' });
    expect(Object.keys(franjas[0]!).sort()).toEqual(['estado', 'etiqueta', 'fin', 'inicio']);
  });

  it('RN-01: una segunda solicitud sobre el mismo horario recibe 409 con los conflictos', async () => {
    const otra = await nuevaSolicitud(MIERCOLES, '09:00', '11:00');
    const res = await http.post(`/api/solicitudes/${otra}/enviar`).set(auth('solicitante'));
    expect(res.status).toBe(409);
    expect(cuerpo(res).codigo).toBe('FRANJA_NO_DISPONIBLE');
    const detalles = cuerpo(res).detalles as { conflictos: unknown[] };
    expect(detalles.conflictos.length).toBeGreaterThan(0);
    const sugerencias = (cuerpo(res).detalles as { sugerencias: { espacios: { espacioId: string }[] }[] })
      .sugerencias;
    expect(sugerencias).toHaveLength(1);
    expect(sugerencias[0]?.espacios.length).toBeGreaterThan(0);
    expect(sugerencias[0]?.espacios.some((e) => e.espacioId === espacioId)).toBe(false);
  });

  it('RNF-05: dos envíos simultáneos sobre la misma franja libre, exactamente uno confirma', async () => {
    const a = await nuevaSolicitud(JUEVES, '14:00', '16:00');
    const b = await nuevaSolicitud(JUEVES, '14:00', '16:00');
    const [ra, rb] = await Promise.all([
      http.post(`/api/solicitudes/${a}/enviar`).set(auth('solicitante')),
      http.post(`/api/solicitudes/${b}/enviar`).set(auth('solicitante')),
    ]);
    expect([ra.status, rb.status].sort()).toEqual([200, 409]);
    const activas = await prisma.franjaOcupada.count({
      where: { espacioId, estado: { not: 'LIBERADA' }, inicio: { gte: new Date(hora(JUEVES, '00:00')) } },
    });
    expect(activas).toBe(1);
  });

  it('UC-02: la aprobación exige el aval; con aval emite la cotización', async () => {
    const sinAval = await http
      .post(`/api/solicitudes/${solicitudId}/decisiones`)
      .set(auth('aprobador'))
      .send({ tipo: 'APROBACION', resultado: 'APROBADA' });
    expect(sinAval.status).toBe(422);
    expect(cuerpo(sinAval).codigo).toBe('AVAL_PENDIENTE');

    const aval = await http
      .post(`/api/solicitudes/${solicitudId}/decisiones`)
      .set(auth('responsable'))
      .send({ tipo: 'AVAL', resultado: 'APROBADA' });
    expect(aval.status).toBe(200);
    expect(cuerpo(aval).estadoSolicitud).toBe('EN_REVISION');

    const aprobacion = await http
      .post(`/api/solicitudes/${solicitudId}/decisiones`)
      .set(auth('aprobador'))
      .send({ tipo: 'APROBACION', resultado: 'APROBADA' });
    expect(aprobacion.status).toBe(200);
    expect(cuerpo(aprobacion)).toMatchObject({ estadoSolicitud: 'COTIZADA' });
    expect(String(cuerpo(aprobacion).cotizacion)).toMatch(/^COT-\d{4}-\d{4,}$/);

    const detalle = await http.get(`/api/solicitudes/${solicitudId}`).set(auth('aprobador'));
    expect(detalle.status).toBe(200);
    expect(cuerpo(detalle).cotizacion).toMatchObject({ subtotal: 80_000, total: 80_000 });
  });

  it('tesorería ve la solicitud; el solicitante no tiene bandeja de revisión', async () => {
    const ajeno = await http.get(`/api/solicitudes/${solicitudId}`).set(auth('tesoreria'));
    expect(ajeno.status).toBe(200);
    const bandeja = await http
      .get('/api/solicitudes')
      .query({ ambito: 'BANDEJA' })
      .set(auth('solicitante'));
    expect(bandeja.status).toBe(403);
  });

  it('la cotización se descarga en PDF para el solicitante y para el aprobador', async () => {
    for (const quien of ['solicitante', 'aprobador']) {
      const res = await http
        .get(`/api/solicitudes/${solicitudId}/cotizacion.pdf`)
        .set(auth(quien))
        .buffer(true)
        .parse((respuesta, devolver) => {
          const partes: Buffer[] = [];
          respuesta.on('data', (parte: Buffer) => partes.push(parte));
          respuesta.on('end', () => devolver(null, Buffer.concat(partes)));
        });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    }
  });

  it('UC-03: genera la orden OP-, carga el soporte y tesorería la aprueba', async () => {
    const orden = await http
      .post('/api/pagos/ordenes')
      .set(auth('solicitante'))
      .send({ solicitudId });
    expect(orden.status).toBe(201);
    ordenId = cuerpo(orden).id as string;
    expect(String(cuerpo(orden).referencia)).toMatch(/^OP-\d{4}-\d{6}$/);
    expect(cuerpo(orden).valor).toBe(80_000);

    const soporte = await http
      .post(`/api/pagos/ordenes/${ordenId}/soporte`)
      .set(auth('solicitante'))
      .attach('archivo', PDF, { filename: 'consignacion.pdf', contentType: 'application/pdf' });
    expect(soporte.status).toBe(200);
    expect(cuerpo(soporte)).toMatchObject({ estado: 'EN_VERIFICACION', tieneSoporte: true });

    const verificacion = await http
      .post(`/api/pagos/ordenes/${ordenId}/verificacion`)
      .set(auth('tesoreria'))
      .send({ resultado: 'APROBADA' });
    expect(verificacion.status).toBe(200);
    expect(cuerpo(verificacion)).toEqual({ estadoOrden: 'APROBADA', estadoSolicitud: 'CONFIRMADA' });

    const franja = await prisma.franjaOcupada.findFirstOrThrow({
      where: { espacioId, reservaItem: { solicitudId } },
    });
    expect(franja.estado).toBe('CONFIRMADA');
    expect(franja.retenidaHasta).toBeNull();
  });

  it('una solicitud ya pagada no admite otra orden de pago', async () => {
    const nueva = await http
      .post('/api/pagos/ordenes')
      .set(auth('solicitante'))
      .send({ solicitudId });
    expect(nueva.status).toBe(409);
  });

  it('UC-05: acta de entrega (EN_USO) y de devolución (FINALIZADA) con checklist', async () => {
    const entrega = await http
      .post('/api/actas')
      .set(auth('responsable'))
      .send({
        solicitudId,
        tipo: 'ENTREGA',
        checklist: [{ elementoId, cantidadEncontrada: 1, estadoFisico: 'BUENO' }],
      });
    expect(entrega.status).toBe(201);
    expect(cuerpo(entrega)).toMatchObject({ estadoSolicitud: 'EN_USO', tipo: 'ENTREGA' });
    actaEntregaId = cuerpo(entrega).id as string;

    const repetida = await http
      .post('/api/actas')
      .set(auth('responsable'))
      .send({
        solicitudId,
        tipo: 'ENTREGA',
        checklist: [{ elementoId, cantidadEncontrada: 1, estadoFisico: 'BUENO' }],
      });
    expect(repetida.status).toBe(409);

    const devolucion = await http
      .post('/api/actas')
      .set(auth('responsable'))
      .send({
        solicitudId,
        tipo: 'DEVOLUCION',
        checklist: [{ elementoId, cantidadEncontrada: 1, estadoFisico: 'BUENO' }],
      });
    expect(devolucion.status).toBe(201);
    expect(cuerpo(devolucion).estadoSolicitud).toBe('FINALIZADA');

    const lectura = await http.get(`/api/actas/${actaEntregaId}`).set(auth('solicitante'));
    expect(lectura.status).toBe(200);

    const pdf = await http
      .get(`/api/actas/${actaEntregaId}.pdf`)
      .set(auth('responsable'))
      .buffer(true)
      .parse((respuesta, devolver) => {
        const partes: Buffer[] = [];
        respuesta.on('data', (parte: Buffer) => partes.push(parte));
        respuesta.on('end', () => devolver(null, Buffer.concat(partes)));
      });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('el solicitante recibió notificaciones de los cambios de estado', async () => {
    const res = await http.get('/api/notificaciones').set(auth('solicitante'));
    expect(res.status).toBe(200);
    expect(cuerpo(res).total as number).toBeGreaterThanOrEqual(3);
    expect(cuerpo(res).noLeidas as number).toBeGreaterThanOrEqual(3);
  });

  it('la bitácora registra el envío, la decisión y el pago, y solo la ve administración', async () => {
    const prohibido = await http.get('/api/auditoria').set(auth('solicitante'));
    expect(prohibido.status).toBe(403);

    const res = await http
      .get('/api/auditoria')
      .query({ entidad: 'Solicitud', entidadId: solicitudId, porPagina: 100 })
      .set(auth('admin'));
    expect(res.status).toBe(200);
    const acciones = (cuerpo(res).datos as { accion: string }[]).map((r) => r.accion);
    expect(acciones).toEqual(
      expect.arrayContaining(['SOLICITUD_ENVIADA', 'SOLICITUD_DECIDIDA']),
    );
  });

  it('el tablero cuenta las solicitudes del periodo y el recaudo aprobado', async () => {
    const res = await http.get('/api/reportes/tablero').set(auth('admin'));
    expect(res.status).toBe(200);
    const estados = (cuerpo(res).solicitudesPorEstado as { estado: string; cantidad: number }[]).map(
      (e) => e.estado,
    );
    expect(estados).toContain('FINALIZADA');
    expect((cuerpo(res).recaudo as { total: number }).total).toBeGreaterThanOrEqual(80_000);
  });

  it('las exportaciones entregan CSV y XLSX reales, y el recaudo no se exporta al aprobador', async () => {
    const csv = await http
      .get('/api/reportes/solicitudes.csv')
      .set(auth('admin'))
      .buffer(true)
      .parse((respuesta, devolver) => {
        const partes: Buffer[] = [];
        respuesta.on('data', (parte: Buffer) => partes.push(parte));
        respuesta.on('end', () => devolver(null, Buffer.concat(partes)));
      });
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const texto = (csv.body as Buffer).toString('utf8');
    expect(texto.startsWith('﻿Consecutivo,Estado,Evento,Solicitante')).toBe(true);
    expect(texto).toContain(`Evento E2E ${sufijo}`);

    const xlsx = await http
      .get('/api/reportes/recaudo.xlsx')
      .set(auth('tesoreria'))
      .buffer(true)
      .parse((respuesta, devolver) => {
        const partes: Buffer[] = [];
        respuesta.on('data', (parte: Buffer) => partes.push(parte));
        respuesta.on('end', () => devolver(null, Buffer.concat(partes)));
      });
    expect(xlsx.status).toBe(200);
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');

    const prohibido = await http.get('/api/reportes/recaudo.csv').set(auth('aprobador'));
    expect(prohibido.status).toBe(403);
    expect(cuerpo(prohibido).codigo).toBe('SIN_PERMISO');
    const desconocido = await http.get('/api/reportes/usuarios.csv').set(auth('admin'));
    expect(desconocido.status).toBe(400);
  });

  it('RN-02d: un pago tardío con las franjas libres confirma la solicitud vencida', async () => {
    const id = await nuevaSolicitud(VIERNES, '14:00', '16:00');
    expect((await http.post(`/api/solicitudes/${id}/enviar`).set(auth('solicitante'))).status).toBe(200);
    for (const [quien, tipo] of [
      ['responsable', 'AVAL'],
      ['aprobador', 'APROBACION'],
    ] as const) {
      const r = await http
        .post(`/api/solicitudes/${id}/decisiones`)
        .set(auth(quien))
        .send({ tipo, resultado: 'APROBADA' });
      expect(r.status).toBe(200);
    }
    const orden = await http.post('/api/pagos/ordenes').set(auth('solicitante')).send({ solicitudId: id });
    expect(orden.status).toBe(201);
    const ordenTardia = cuerpo(orden).id as string;

    await prisma.solicitud.update({ where: { id }, data: { venceEn: new Date(Date.now() - 60_000) } });
    await app.get(VencimientosService).ejecutar();
    const vencida = await prisma.solicitud.findUniqueOrThrow({ where: { id } });
    expect(vencida.estado).toBe('VENCIDA');
    expect((await prisma.ordenPago.findUniqueOrThrow({ where: { id: ordenTardia } })).estado).toBe('VENCIDA');

    const tardio = await http
      .post(`/api/pagos/ordenes/${ordenTardia}/pago-tardio`)
      .set(auth('tesoreria'))
      .send({ observacion: 'Consignación recibida fuera de plazo.' });
    expect(tardio.status).toBe(200);
    expect(cuerpo(tardio)).toMatchObject({ resultado: 'CONFIRMADA', estadoSolicitud: 'CONFIRMADA' });

    const franja = await prisma.franjaOcupada.findFirstOrThrow({ where: { reservaItem: { solicitudId: id } } });
    expect(franja.estado).toBe('CONFIRMADA');

    const repetido = await http
      .post(`/api/pagos/ordenes/${ordenTardia}/pago-tardio`)
      .set(auth('tesoreria'))
      .send({});
    expect(repetido.status).toBe(409);
  });

  it('RN-07/RN-08: la solicitud institucional avalada se confirma sin pago, con valor de referencia', async () => {
    const id = await nuevaSolicitud(MARTES, '08:00', '10:00', 'interno', { declaraUsoInstitucional: true });
    const enviada = await http.post(`/api/solicitudes/${id}/enviar`).set(auth('interno'));
    expect(enviada.status).toBe(200);
    expect(cuerpo(enviada)).toMatchObject({ esExenta: true, tipoTarifa: 'INTERNO', estado: 'EN_REVISION' });

    const aval = await http
      .post(`/api/solicitudes/${id}/decisiones`)
      .set(auth('responsable'))
      .send({ tipo: 'AVAL', resultado: 'APROBADA' });
    expect(aval.status).toBe(200);
    const aprobacion = await http
      .post(`/api/solicitudes/${id}/decisiones`)
      .set(auth('aprobador'))
      .send({ tipo: 'APROBACION', resultado: 'APROBADA' });
    expect(aprobacion.status).toBe(200);
    expect(cuerpo(aprobacion).estadoSolicitud).toBe('CONFIRMADA');

    const detalle = await http.get(`/api/solicitudes/${id}`).set(auth('interno'));
    expect(cuerpo(detalle).cotizacion).toMatchObject({ total: 0, valorReferencia: 30_000 });

    const orden = await http.post('/api/pagos/ordenes').set(auth('interno')).send({ solicitudId: id });
    expect(orden.status).toBe(422);
    expect(cuerpo(orden).codigo).toBe('SOLICITUD_EXENTA');

    const franja = await prisma.franjaOcupada.findFirstOrThrow({ where: { reservaItem: { solicitudId: id } } });
    expect(franja.estado).toBe('CONFIRMADA');
  });

  it('UC-02: una solicitud devuelta libera la franja, se corrige y se puede reenviar', async () => {
    const id = await nuevaSolicitud(LUNES, '14:00', '16:00');
    expect((await http.post(`/api/solicitudes/${id}/enviar`).set(auth('solicitante'))).status).toBe(200);

    const sinMotivo = await http
      .post(`/api/solicitudes/${id}/decisiones`)
      .set(auth('responsable'))
      .send({ tipo: 'AVAL', resultado: 'DEVUELTA' });
    expect(sinMotivo.status).toBe(422);
    expect(cuerpo(sinMotivo).codigo).toBe('MOTIVO_REQUERIDO');

    const devuelta = await http
      .post(`/api/solicitudes/${id}/decisiones`)
      .set(auth('responsable'))
      .send({ tipo: 'AVAL', resultado: 'DEVUELTA', motivo: 'Falta el responsable en sitio.' });
    expect(devuelta.status).toBe(200);
    expect(cuerpo(devuelta).estadoSolicitud).toBe('BORRADOR');
    const liberada = await prisma.franjaOcupada.findFirstOrThrow({
      where: { espacioId, inicio: { gte: new Date(hora(LUNES, '00:00')) }, estado: 'LIBERADA' },
    });
    expect(liberada.reservaItemId).toBeNull();

    const corregida = await http
      .patch(`/api/solicitudes/${id}`)
      .set(auth('solicitante'))
      .send({ responsableEnSitio: 'Carlos Muñoz' });
    expect(corregida.status).toBe(200);
    const reenviada = await http.post(`/api/solicitudes/${id}/enviar`).set(auth('solicitante'));
    expect(reenviada.status).toBe(200);
    expect(cuerpo(reenviada).estado).toBe('EN_REVISION');
  });

  it('RN-14: cancelar una solicitud confirmada con antelación reembolsa todo y libera el horario', async () => {
    const id = await nuevaSolicitud(SABADO, '14:00', '16:00');
    await aprobarSolicitud(id);
    const orden = await http.post('/api/pagos/ordenes').set(auth('solicitante')).send({ solicitudId: id });
    expect(orden.status).toBe(201);
    const ordenId = cuerpo(orden).id as string;
    await http
      .post(`/api/pagos/ordenes/${ordenId}/soporte`)
      .set(auth('solicitante'))
      .attach('archivo', PDF, { filename: 'consignacion.pdf', contentType: 'application/pdf' });
    const verificada = await http
      .post(`/api/pagos/ordenes/${ordenId}/verificacion`)
      .set(auth('tesoreria'))
      .send({ resultado: 'APROBADA' });
    expect(verificada.status).toBe(200);

    const ajeno = await http
      .post(`/api/solicitudes/${id}/cancelar`)
      .set(auth('interno'))
      .send({ motivo: 'No es mía.' });
    expect(ajeno.status).toBe(404);

    const cancelada = await http
      .post(`/api/solicitudes/${id}/cancelar`)
      .set(auth('solicitante'))
      .send({ motivo: 'Cambió la fecha del evento.' });
    expect(cancelada.status).toBe(200);
    expect(cuerpo(cancelada)).toMatchObject({
      estadoSolicitud: 'CANCELADA',
      porcentajeReembolso: 100,
      valorReembolso: 40_000,
      canceladaPorInstitucion: false,
    });
    const franja = await prisma.franjaOcupada.findFirstOrThrow({ where: { reservaItem: { solicitudId: id } } });
    expect(franja.estado).toBe('LIBERADA');

    const otra = await nuevaSolicitud(SABADO, '14:00', '16:00');
    const reenvio = await http.post(`/api/solicitudes/${otra}/enviar`).set(auth('solicitante'));
    expect(reenvio.status).toBe(200);
  });

  it('RN-02d: un pago tardío con el horario ya tomado por otra solicitud queda para reembolso total', async () => {
    const a = await nuevaSolicitud(MARTES, '14:00', '16:00');
    await aprobarSolicitud(a);
    const orden = await http.post('/api/pagos/ordenes').set(auth('solicitante')).send({ solicitudId: a });
    expect(orden.status).toBe(201);
    const ordenId = cuerpo(orden).id as string;
    const valor = cuerpo(orden).valor as number;

    await prisma.solicitud.update({ where: { id: a }, data: { venceEn: new Date(Date.now() - 60_000) } });
    await app.get(VencimientosService).ejecutar();
    expect((await prisma.solicitud.findUniqueOrThrow({ where: { id: a } })).estado).toBe('VENCIDA');

    const b = await nuevaSolicitud(MARTES, '14:00', '16:00');
    expect((await http.post(`/api/solicitudes/${b}/enviar`).set(auth('solicitante'))).status).toBe(200);

    const tardio = await http
      .post(`/api/pagos/ordenes/${ordenId}/pago-tardio`)
      .set(auth('tesoreria'))
      .send({ observacion: 'Consignación fuera de plazo.' });
    expect(tardio.status).toBe(200);
    expect(cuerpo(tardio)).toEqual({
      resultado: 'REEMBOLSO',
      estadoSolicitud: 'VENCIDA',
      valorReembolso: valor,
    });

    const reembolso = await prisma.reembolso.findFirstOrThrow({ where: { ordenPagoId: ordenId } });
    expect(reembolso).toMatchObject({ valor, estado: 'SOLICITADO', motivo: 'PAGO_TARDIO_SIN_FRANJA_LIBRE' });
    expect((await prisma.solicitud.findUniqueOrThrow({ where: { id: a } })).estado).toBe('VENCIDA');
    expect((await prisma.solicitud.findUniqueOrThrow({ where: { id: b } })).estado).toBe('EN_REVISION');
  });

  it('RN-02a: recuerda a las 24 h, escala a las 48 h y no repite los avisos', async () => {
    const id = await nuevaSolicitud(JUEVES, '08:00', '10:00');
    expect((await http.post(`/api/solicitudes/${id}/enviar`).set(auth('solicitante'))).status).toBe(200);
    const responsableId = (await prisma.espacio.findUniqueOrThrow({ where: { id: espacioId } })).responsableId;
    const avisos = (accion: string) =>
      prisma.bitacora.count({ where: { entidad: 'Solicitud', entidadId: id, accion } });
    const recordatorios = () =>
      prisma.notificacion.count({
        where: { usuarioId: responsableId ?? '', titulo: { contains: 'Recordatorio' } },
      });
    const antes = await recordatorios();

    await prisma.solicitud.update({
      where: { id },
      data: { enviadaEn: new Date(Date.now() - 30 * 3_600_000) },
    });
    const servicio = app.get(RecordatoriosService);
    await servicio.ejecutar();
    expect(await avisos('RECORDATORIO_REVISION')).toBe(1);
    expect(await avisos('ESCALAMIENTO_REVISION')).toBe(0);
    expect(await recordatorios()).toBe(antes + 1);

    await servicio.ejecutar();
    expect(await avisos('RECORDATORIO_REVISION')).toBe(1);
    expect(await recordatorios()).toBe(antes + 1);

    await prisma.solicitud.update({
      where: { id },
      data: { enviadaEn: new Date(Date.now() - 50 * 3_600_000) },
    });
    await servicio.ejecutar();
    await servicio.ejecutar();
    expect(await avisos('ESCALAMIENTO_REVISION')).toBe(1);
    expect(await avisos('RECORDATORIO_REVISION')).toBe(1);
  });

  it('documentos: adjunta, lista, descarga y quita un archivo del borrador, validando el contenido', async () => {
    const id = await nuevaSolicitud(JUEVES, '17:00', '18:00');
    const url = `/api/solicitudes/${id}/documentos`;

    const falso = await http
      .post(url)
      .set(auth('solicitante'))
      .field('tipo', 'POLIZA')
      .attach('archivo', Buffer.from('<html>no soy un pdf</html>'), {
        filename: 'poliza.pdf',
        contentType: 'application/pdf',
      });
    expect(falso.status).toBe(422);
    expect(cuerpo(falso).codigo).toBe('ARCHIVO_NO_PERMITIDO');

    const subido = await http
      .post(url)
      .set(auth('solicitante'))
      .field('tipo', 'POLIZA')
      .attach('archivo', PDF, { filename: '../../poliza.pdf', contentType: 'application/pdf' });
    expect(subido.status).toBe(201);
    expect(cuerpo(subido)).toMatchObject({ tipo: 'POLIZA', nombre: 'poliza.pdf' });
    const documentoId = cuerpo(subido).id as string;

    const lista = await http.get(url).set(auth('solicitante'));
    expect(lista.status).toBe(200);
    expect((lista.body as unknown[]).length).toBe(1);
    expect((await http.get(url).set(auth('interno'))).status).toBe(404);

    const archivo = await http
      .get(`${url}/${documentoId}/archivo`)
      .set(auth('solicitante'))
      .buffer(true)
      .parse((respuesta, devolver) => {
        const partes: Buffer[] = [];
        respuesta.on('data', (parte: Buffer) => partes.push(parte));
        respuesta.on('end', () => devolver(null, Buffer.concat(partes)));
      });
    expect(archivo.status).toBe(200);
    expect((archivo.body as Buffer).equals(PDF)).toBe(true);

    expect((await http.delete(`${url}/${documentoId}`).set(auth('solicitante'))).status).toBe(204);
    expect(((await http.get(url).set(auth('solicitante'))).body as unknown[]).length).toBe(0);
  });

  it('fotos: sube una imagen, genera las variantes WebP, el inventario público la muestra y se elimina', async () => {
    const imagen = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#2a6f4e' } })
      .jpeg()
      .toBuffer();
    const sinTexto = await http
      .post(`/api/espacios/${espacioId}/fotos`)
      .set(auth('admin'))
      .attach('archivo', imagen, { filename: 'aula.jpg', contentType: 'image/jpeg' });
    expect(sinTexto.status).toBe(400);

    const ajeno = await http
      .post(`/api/espacios/${espacioId}/fotos`)
      .set(auth('solicitante'))
      .field('textoAlternativo', 'Aula')
      .attach('archivo', imagen, { filename: 'aula.jpg', contentType: 'image/jpeg' });
    expect(ajeno.status).toBe(403);

    const subida = await http
      .post(`/api/espacios/${espacioId}/fotos`)
      .set(auth('responsable'))
      .field('textoAlternativo', 'Vista del aula desde el fondo.')
      .attach('archivo', imagen, { filename: 'aula.jpg', contentType: 'image/jpeg' });
    expect(subida.status).toBe(201);
    expect(cuerpo(subida)).toMatchObject({ esPortada: true, textoAlternativo: 'Vista del aula desde el fondo.' });
    const fotoId = cuerpo(subida).id as string;

    const tarjeta = await http
      .get(`/api/fotos/${fotoId}/tarjeta`)
      .buffer(true)
      .parse((respuesta, devolver) => {
        const partes: Buffer[] = [];
        respuesta.on('data', (parte: Buffer) => partes.push(parte));
        respuesta.on('end', () => devolver(null, Buffer.concat(partes)));
      });
    expect(tarjeta.status).toBe(200);
    expect(tarjeta.headers['content-type']).toContain('image/webp');
    expect((await sharp(tarjeta.body as Buffer).metadata()).width).toBe(480);

    const ficha = await http.get(`/api/espacios/E2E-${sufijo.toUpperCase()}`);
    expect(ficha.status).toBe(200);
    const fotos = cuerpo(ficha).fotos as { urlTarjeta: string; alt: string }[];
    expect(fotos[0]).toMatchObject({
      urlTarjeta: `/api/fotos/${fotoId}/tarjeta`,
      alt: 'Vista del aula desde el fondo.',
    });

    const eliminada = await http.delete(`/api/espacios/${espacioId}/fotos/${fotoId}`).set(auth('responsable'));
    expect(eliminada.status).toBe(204);
    expect((await http.get(`/api/fotos/${fotoId}/tarjeta`)).status).toBe(404);
  });

  it('bloqueos: crea una serie semanal, choca con otra, se anula y vuelve a quedar libre', async () => {
    const hasta = new Date(`${SABADO}T00:00:00.000Z`);
    hasta.setUTCDate(hasta.getUTCDate() + 14);
    hasta.setUTCHours(23, 59, 0, 0);
    const datos = {
      espacioId,
      motivo: 'MANTENIMIENTO',
      inicio: hora(SABADO, '10:00'),
      fin: hora(SABADO, '12:00'),
      rrule: 'FREQ=WEEKLY',
      repetirHasta: hasta.toISOString(),
    };
    const creado = await http.post('/api/bloqueos').set(auth('admin')).send(datos);
    expect(creado.status).toBe(201);
    expect(cuerpo(creado).franjasCreadas).toBe(3);
    const bloqueoId = cuerpo(creado).id as string;

    const choque = await http.post('/api/bloqueos').set(auth('admin')).send(datos);
    expect(choque.status).toBe(409);
    expect(cuerpo(choque).codigo).toBe('FRANJA_NO_DISPONIBLE');

    const ajeno = await http.post('/api/bloqueos').set(auth('solicitante')).send(datos);
    expect(ajeno.status).toBe(403);

    const anulado = await http
      .patch(`/api/bloqueos/${bloqueoId}/anular`)
      .set(auth('admin'))
      .send({ motivo: 'Se canceló el mantenimiento.' });
    expect(anulado.status).toBe(200);
    expect(cuerpo(anulado).franjasLiberadas).toBe(3);

    const repetido = await http
      .patch(`/api/bloqueos/${bloqueoId}/anular`)
      .set(auth('admin'))
      .send({ motivo: 'Otra vez.' });
    expect(repetido.status).toBe(409);
    expect(cuerpo(repetido).codigo).toBe('BLOQUEO_YA_ANULADO');

    const activas = await prisma.franjaOcupada.count({
      where: { bloqueoId, estado: { not: 'LIBERADA' } },
    });
    expect(activas).toBe(0);
    const bloqueo = await prisma.bloqueoCalendario.findUniqueOrThrow({ where: { id: bloqueoId } });
    expect(bloqueo.anuladoEn).not.toBeNull();

    const denuevo = await http.post('/api/bloqueos').set(auth('admin')).send(datos);
    expect(denuevo.status).toBe(201);
  });

  it('RN-02: el job de vencimientos libera la franja de una solicitud en revisión sin decisión', async () => {
    const id = await nuevaSolicitud(VIERNES, '08:00', '10:00');
    const enviada = await http.post(`/api/solicitudes/${id}/enviar`).set(auth('solicitante'));
    expect(enviada.status).toBe(200);

    await prisma.solicitud.update({ where: { id }, data: { venceEn: new Date(Date.now() - 60_000) } });
    const resultado = await app.get(VencimientosService).ejecutar();
    expect(resultado.solicitudes).toBeGreaterThanOrEqual(1);

    const solicitud = await prisma.solicitud.findUniqueOrThrow({ where: { id } });
    expect(solicitud.estado).toBe('VENCIDA');
    const franja = await prisma.franjaOcupada.findFirstOrThrow({ where: { reservaItem: { solicitudId: id } } });
    expect(franja.estado).toBe('LIBERADA');
  });
});
