import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Rol } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/shared/prisma/prisma.service.js';
import { crearAppPrueba } from './utilidades/app-prueba.js';

const sufijo = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
const CONTRASENA = 'Clave-segura-E2E-2026';

describe.sequential('Administración del inventario contra la base real', () => {
  let app: Awaited<ReturnType<typeof crearAppPrueba>>;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let admin = '';
  let solicitante = '';

  let sedeId = '';
  let bloqueId = '';
  let tipoId = '';
  let espacioId = '';
  let elementoId = '';
  const codigoEspacio = `X-${sufijo}`;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const cuerpo = (res: { body: unknown }) =>
    res.body as Record<string, unknown>;

  async function usuario(correo: string, rol: Rol): Promise<string> {
    const creado = await prisma.usuario.create({
      data: {
        correo,
        hashContrasena: await argon2.hash(CONTRASENA, {
          type: argon2.argon2id,
        }),
        correoVerificado: true,
        esInstitucional: true,
        roles: { create: [{ rol }] },
      },
    });
    return app.get(JwtService).sign({
      sub: creado.id,
      correo,
      roles: [rol],
      dependencias: [],
      verificado: true,
      institucional: true,
    });
  }

  beforeAll(async () => {
    app = await crearAppPrueba();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());
    admin = await usuario(
      `e2e-inv-admin-${sufijo}@itp.edu.co`,
      Rol.ADMINISTRADOR,
    );
    solicitante = await usuario(
      `e2e-inv-sol-${sufijo}@example.com`,
      Rol.SOLICITANTE,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('solo el administrador entra a la administración del inventario', async () => {
    expect((await http.get('/api/bloques')).status).toBe(401);
    for (const ruta of [
      '/api/bloques',
      '/api/elementos',
      '/api/sedes/gestion',
      '/api/tipos-espacio/gestion',
      '/api/espacios/gestion',
      '/api/espacios/gestion/A-101',
    ]) {
      expect((await http.get(ruta).set(auth(solicitante))).status).toBe(403);
    }
  });

  it('crea sede, bloque y tipo, y rechaza códigos repetidos', async () => {
    const sede = await http
      .post('/api/sedes')
      .set(auth(admin))
      .send({ codigo: `S${sufijo}`, nombre: 'Sede E2E', municipio: 'Mocoa' });
    expect(sede.status).toBe(201);
    sedeId = cuerpo(sede).id as string;
    expect(
      (
        await http
          .post('/api/sedes')
          .set(auth(admin))
          .send({ codigo: `S${sufijo}`, nombre: 'Otra', municipio: 'X' })
      ).status,
    ).toBe(409);

    const bloque = await http
      .post('/api/bloques')
      .set(auth(admin))
      .send({ sedeId, codigo: 'A', nombre: 'Bloque A', numeroPisos: 2 });
    expect(bloque.status).toBe(201);
    bloqueId = cuerpo(bloque).id as string;
    expect(cuerpo(bloque)).toMatchObject({
      sedeCodigo: `S${sufijo}`,
      numeroPisos: 2,
      espaciosActivos: 0,
    });
    expect(
      (
        await http
          .post('/api/bloques')
          .set(auth(admin))
          .send({ sedeId, codigo: 'A', nombre: 'Rep', numeroPisos: 1 })
      ).status,
    ).toBe(409);

    const tipo = await http
      .post('/api/tipos-espacio')
      .set(auth(admin))
      .send({
        codigo: `T${sufijo}`,
        nombre: 'Tipo E2E',
        anticipacionMinimaDias: 5,
        aforoExigePoliza: 100,
      });
    expect(tipo.status).toBe(201);
    tipoId = cuerpo(tipo).id as string;
    expect(cuerpo(tipo)).toMatchObject({
      anticipacionMinimaDias: 5,
      aforoExigePoliza: 100,
      activo: true,
    });
  });

  it('crea el espacio, lo modifica y valida pisos', async () => {
    const responsable = await prisma.usuario.findUniqueOrThrow({ where: { correo: `e2e-inv-admin-${sufijo}@itp.edu.co` } });
    const creado = await http
      .post('/api/espacios')
      .set(auth(admin))
      .send({
        sede: `S${sufijo}`,
        bloque: 'A',
        tipo: `T${sufijo}`,
        codigo: codigoEspacio,
        nombre: 'Aula E2E',
        piso: 1,
        capacidadPersonas: 30,
        responsableId: responsable.id,
      });
    expect(creado.status).toBe(201);
    espacioId = (
      await prisma.espacio.findUniqueOrThrow({
        where: { codigo: codigoEspacio },
      })
    ).id;
    expect((await prisma.espacio.findUniqueOrThrow({ where: { id: espacioId } })).responsableId).toBe(responsable.id);

    const editado = await http
      .patch(`/api/espacios/${codigoEspacio}`)
      .set(auth(admin))
      .send({
        nombre: 'Aula E2E renovada',
        capacidadPersonas: 35,
        estado: 'EN_MANTENIMIENTO',
      });
    expect(editado.status).toBe(200);
    expect(cuerpo(editado)).toMatchObject({
      nombre: 'Aula E2E renovada',
      capacidadPersonas: 35,
    });
    expect(
      (await prisma.espacio.findUniqueOrThrow({ where: { id: espacioId } }))
        .estado,
    ).toBe('EN_MANTENIMIENTO');

    const pisoMalo = await http
      .patch(`/api/espacios/${codigoEspacio}`)
      .set(auth(admin))
      .send({ piso: 5 });
    expect(pisoMalo.status).toBe(422);
    expect(cuerpo(pisoMalo).codigo).toBe('PISO_INVALIDO');
    expect(
      (
        await http
          .patch('/api/espacios/NO-EXISTE')
          .set(auth(admin))
          .send({ nombre: 'X' })
      ).status,
    ).toBe(404);
  });

  it('el catálogo público entrega el UUID para consultar disponibilidad sin acceso administrativo', async () => {
    const swagger = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const esquemas = swagger.components!.schemas!;
    expect(esquemas.FotoPortadaDto).toMatchObject({ required: ['url', 'alt'] });
    expect(esquemas.FotoDto).toMatchObject({
      properties: { id: { type: 'string' } },
    });
    expect(esquemas.TarjetaEspacioDto).toMatchObject({
      properties: {
        id: { type: 'string', format: 'uuid' },
        portada: {
          nullable: true,
          allOf: [{ $ref: '#/components/schemas/FotoPortadaDto' }],
        },
      },
    });
    expect(esquemas.FichaEspacioDto).toMatchObject({
      properties: { id: { type: 'string', format: 'uuid' } },
    });
    const ficha = await http.get(`/api/espacios/${codigoEspacio}`);
    expect(ficha.status).toBe(200);
    expect(cuerpo(ficha)).toMatchObject({
      id: espacioId,
      codigo: codigoEspacio,
    });
    expect(cuerpo(ficha)).not.toHaveProperty('responsableId');
    expect(cuerpo(ficha)).not.toHaveProperty('dependenciaId');
    expect(cuerpo(ficha)).not.toHaveProperty('aforo');
    const noCabe = await http
      .get(`/api/espacios/${codigoEspacio}`)
      .query({ asistentes: 36 });
    expect(noCabe.status).toBe(200);
    expect(cuerpo(noCabe).aforo).toMatchObject({ nivel: 'NO_CABE' });
    const cabe = await http
      .get(`/api/espacios/${codigoEspacio}`)
      .query({ asistentes: 30 });
    expect(cabe.status).toBe(200);
    expect(cuerpo(cabe).aforo).toMatchObject({ nivel: 'ADECUADO' });
    expect(
      (
        await http
          .get(`/api/espacios/${codigoEspacio}`)
          .query({ asistentes: -1 })
      ).status,
    ).toBe(400);

    const listado = await http
      .get('/api/espacios')
      .query({ sede: `S${sufijo}` });
    expect(listado.status).toBe(200);
    expect(cuerpo(listado).datos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: espacioId, codigo: codigoEspacio }),
      ]),
    );
    const bloque = await http.get(`/api/sedes/S${sufijo}/bloques/A`);
    expect(bloque.status).toBe(200);
    expect(cuerpo(bloque).pisos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          espacios: expect.arrayContaining([
            expect.objectContaining({ id: espacioId }),
          ]),
        }),
      ]),
    );

    const disponibilidad = await http.get('/api/disponibilidad').query({
      espacioId: cuerpo(ficha).id,
      desde: '2027-01-04T13:00:00.000Z',
      hasta: '2027-01-04T14:00:00.000Z',
    });
    expect(disponibilidad.status).toBe(200);
    expect(cuerpo(disponibilidad).espacioId).toBe(espacioId);
  });

  it('RN-19: reemplaza el horario de operación y lo valida', async () => {
    const ruta = `/api/espacios/${codigoEspacio}/horarios`;
    const ok = await http
      .put(ruta)
      .set(auth(admin))
      .send({
        horarios: [
          { diaSemana: 1, abre: '06:00', cierra: '22:00' },
          { diaSemana: 2, abre: '08:00', cierra: '18:00' },
        ],
      });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual([
      { diaSemana: 1, abre: '06:00', cierra: '22:00' },
      { diaSemana: 2, abre: '08:00', cierra: '18:00' },
    ]);
    expect(await prisma.horarioOperacion.count({ where: { espacioId } })).toBe(
      2,
    );

    const invertido = await http
      .put(ruta)
      .set(auth(admin))
      .send({ horarios: [{ diaSemana: 1, abre: '22:00', cierra: '06:00' }] });
    expect(invertido.status).toBe(422);
    expect(cuerpo(invertido).codigo).toBe('HORARIO_INVALIDO');
    const malaHora = await http
      .put(ruta)
      .set(auth(admin))
      .send({ horarios: [{ diaSemana: 9, abre: '6am', cierra: '22:00' }] });
    expect(malaHora.status).toBe(400);
    expect(await prisma.horarioOperacion.count({ where: { espacioId } })).toBe(
      2,
    );

    expect(
      (await http.put(ruta).set(auth(admin)).send({ horarios: [] })).status,
    ).toBe(200);
    expect(await prisma.horarioOperacion.count({ where: { espacioId } })).toBe(
      0,
    );
  });

  it('la gestión conserva espacios ocultos y valida filtros, paginación y responsables', async () => {
    const detalle = `/api/espacios/gestion/${codigoEspacio.toLowerCase()}`;
    const filtros = { sedeId, bloqueId, sede: `s${sufijo.toLowerCase()}`, bloque: 'a', porPagina: 1 };
    const anterior = await http.get(detalle).set(auth(admin));
    expect(anterior.status).toBe(200);
    expect(cuerpo(anterior)).toMatchObject({ id: espacioId, activo: true, estado: 'EN_MANTENIMIENTO',
      esReservable: true, dependenciaId: null, dependenciaCodigo: null, areaM2: null,
      horarios: [] });
    expect((await http.get('/api/espacios/gestion/NO-EXISTE').set(auth(admin))).status).toBe(404);
    expect((await http.get('/api/espacios/gestion').query({ sedeId: 'invalido' }).set(auth(admin))).status).toBe(400);
    expect((await http.get('/api/espacios/gestion').query({ estado: 'INVALIDO' }).set(auth(admin))).status).toBe(400);
    expect((await http.get('/api/espacios/gestion').query({ activo: 'incorrecto' }).set(auth(admin))).status).toBe(400);
    const actualizado = await http.patch(`/api/espacios/${codigoEspacio}`).set(auth(admin))
      .send({ estado: 'FUERA_DE_SERVICIO', esReservable: false, areaM2: 48.5, depositoPorcentaje: 5.25 });
    expect(actualizado.status).toBe(200);
    expect((await http.get(`/api/espacios/${codigoEspacio}`)).status).toBe(404);
    await prisma.bloque.update({ where: { id: bloqueId }, data: { activo: false } });
    await prisma.sede.update({ where: { id: sedeId }, data: { activa: false } });
    try {
      const listado = await http.get('/api/espacios/gestion').query({ ...filtros, estado: 'FUERA_DE_SERVICIO', activo: true }).set(auth(admin));
      expect(listado.status).toBe(200);
      expect(cuerpo(listado)).toMatchObject({ total: 1, pagina: 1, porPagina: 1, datos: [{
        codigo: codigoEspacio, estado: 'FUERA_DE_SERVICIO', esReservable: false, areaM2: 48.5, depositoPorcentaje: 5.25,
      }] });
      const ficha = await http.get(detalle).set(auth(admin));
      expect(ficha.status).toBe(200);
      expect(cuerpo(ficha)).toMatchObject({ estado: 'FUERA_DE_SERVICIO', esReservable: false });
      const segunda = await http.get('/api/espacios/gestion').query({ ...filtros, pagina: 2 }).set(auth(admin));
      expect(cuerpo(segunda)).toMatchObject({ datos: [], total: 1, pagina: 2 });
    } finally {
      await prisma.bloque.update({ where: { id: bloqueId }, data: { activo: true } });
      await prisma.sede.update({ where: { id: sedeId }, data: { activa: true } });
      await prisma.espacio.update({ where: { id: espacioId }, data: { estado: 'EN_MANTENIMIENTO', esReservable: true } });
    }
    const datos = { sede: `S${sufijo}`, bloque: 'A', tipo: `T${sufijo}`, codigo: `Z-${sufijo}`,
      nombre: 'No debe crearse', piso: 1, capacidadPersonas: 20, responsableId: randomUUID() };
    const inexistente = await http.post('/api/espacios').set(auth(admin)).send(datos);
    expect(inexistente.status).toBe(422);
    expect(cuerpo(inexistente).codigo).toBe('RESPONSABLE_NO_VALIDO');
    const inactivo = await prisma.usuario.findUniqueOrThrow({ where: { correo: `e2e-inv-sol-${sufijo}@example.com` } });
    await prisma.usuario.update({ where: { id: inactivo.id }, data: { activo: false } });
    try {
      const rechazado = await http.post('/api/espacios').set(auth(admin)).send({ ...datos, responsableId: inactivo.id });
      expect(rechazado.status).toBe(422);
      expect(cuerpo(rechazado).codigo).toBe('RESPONSABLE_NO_VALIDO');
    } finally {
      await prisma.usuario.update({ where: { id: inactivo.id }, data: { activo: true } });
    }
  });

  it('registra, traslada y da de baja elementos con placa única', async () => {
    const elemento = await http
      .post('/api/elementos')
      .set(auth(admin))
      .send({
        espacioId,
        nombre: 'Videobeam',
        placaInventario: `P-${sufijo}`,
        valorUnitario: 2_500_000,
        esPrestable: true,
      });
    expect(elemento.status).toBe(201);
    elementoId = cuerpo(elemento).id as string;
    expect(cuerpo(elemento)).toMatchObject({
      espacioCodigo: codigoEspacio,
      estado: 'EN_SERVICIO',
      esPrestable: true,
    });

    const repetida = await http
      .post('/api/elementos')
      .set(auth(admin))
      .send({ espacioId, nombre: 'Otro', placaInventario: `P-${sufijo}` });
    expect(repetida.status).toBe(409);
    expect(cuerpo(repetida).codigo).toBe('PLACA_REGISTRADA');

    const listado = await http
      .get(`/api/elementos?espacioId=${espacioId}`)
      .set(auth(admin));
    expect(listado.status).toBe(200);
    expect((cuerpo(listado).datos as unknown[]).length).toBe(1);

    const baja = await http
      .patch(`/api/elementos/${elementoId}/baja`)
      .set(auth(admin));
    expect(baja.status).toBe(200);
    expect(cuerpo(baja)).toMatchObject({
      estado: 'DADO_DE_BAJA',
      esPrestable: false,
    });
  });

  it('las rutas públicas siguen funcionando junto a las de administración', async () => {
    const sedes = await http.get('/api/sedes');
    expect(sedes.status).toBe(200);
    const tipos = await http.get('/api/tipos-espacio');
    expect(tipos.status).toBe(200);
    expect(JSON.stringify(tipos.body)).toContain(`T${sufijo}`);
    expect((await http.get(`/api/sedes/S${sufijo}/bloques`)).status).toBe(200);
    expect((await http.get(`/api/sedes/S${sufijo}/bloques/A`)).status).toBe(
      200,
    );
  });

  it('nada se archiva mientras tenga dependientes activos', async () => {
    const tipo = await http
      .patch(`/api/tipos-espacio/${tipoId}/archivar`)
      .set(auth(admin));
    expect(tipo.status).toBe(409);
    expect(cuerpo(tipo).codigo).toBe('TIPO_CON_ESPACIOS');
    expect(
      (await http.patch(`/api/bloques/${bloqueId}/archivar`).set(auth(admin)))
        .status,
    ).toBe(409);
    expect(
      (await http.patch(`/api/sedes/${sedeId}/archivar`).set(auth(admin)))
        .status,
    ).toBe(409);
    const pisos = await http
      .patch(`/api/bloques/${bloqueId}`)
      .set(auth(admin))
      .send({ numeroPisos: 0 });
    expect(pisos.status).toBe(400);
  });

  it('al archivar de abajo hacia arriba todo se archiva y se restaura, sin borrar nada', async () => {
    expect(
      (
        await http
          .patch(`/api/espacios/${codigoEspacio}/archivar`)
          .set(auth(admin))
      ).status,
    ).toBe(204);
    const archivado = await http.get(`/api/espacios/gestion/${codigoEspacio}`).set(auth(admin));
    expect(archivado.status).toBe(200);
    expect(cuerpo(archivado).activo).toBe(false);
    const inactivos = await http.get('/api/espacios/gestion').query({ sedeId, activo: false }).set(auth(admin));
    expect(cuerpo(inactivos).datos).toEqual([expect.objectContaining({ id: espacioId, activo: false })]);
    const activos = await http.get('/api/espacios/gestion').query({ sedeId, activo: true }).set(auth(admin));
    expect(cuerpo(activos).total).toBe(0);
    expect(
      (
        await http
          .patch(`/api/tipos-espacio/${tipoId}/archivar`)
          .set(auth(admin))
      ).status,
    ).toBe(200);
    expect(
      (await http.patch(`/api/bloques/${bloqueId}/archivar`).set(auth(admin)))
        .status,
    ).toBe(200);
    expect(
      (await http.patch(`/api/sedes/${sedeId}/archivar`).set(auth(admin)))
        .status,
    ).toBe(200);

    const archivadas = await http
      .get('/api/sedes/gestion?activo=false')
      .set(auth(admin));
    expect(JSON.stringify(archivadas.body)).toContain(`S${sufijo}`);
    const publicas = await http.get('/api/tipos-espacio');
    expect(JSON.stringify(publicas.body)).not.toContain(`T${sufijo}`);

    const bloqueSinSede = await http
      .patch(`/api/bloques/${bloqueId}/restaurar`)
      .set(auth(admin));
    expect(bloqueSinSede.status).toBe(422);
    expect(
      (await http.patch(`/api/sedes/${sedeId}/restaurar`).set(auth(admin)))
        .status,
    ).toBe(200);
    expect(
      (await http.patch(`/api/bloques/${bloqueId}/restaurar`).set(auth(admin)))
        .status,
    ).toBe(200);
    expect(
      (
        await http
          .patch(`/api/tipos-espacio/${tipoId}/restaurar`)
          .set(auth(admin))
      ).status,
    ).toBe(200);

    expect(await prisma.elemento.count({ where: { id: elementoId } })).toBe(1);
  });

  it('cada escritura queda en la bitácora', async () => {
    const acciones = await prisma.bitacora.findMany({
      where: {
        accion: {
          in: [
            'SEDE_CREADA',
            'BLOQUE_CREADO',
            'ELEMENTO_DADO_DE_BAJA',
            'ESPACIO_ACTUALIZADO',
          ],
        },
      },
      select: { accion: true },
      orderBy: { ocurrioEn: 'desc' },
      take: 200,
    });
    const vistas = new Set(acciones.map((a) => a.accion));
    expect(vistas).toEqual(
      new Set([
        'SEDE_CREADA',
        'BLOQUE_CREADO',
        'ELEMENTO_DADO_DE_BAJA',
        'ESPACIO_ACTUALIZADO',
      ]),
    );
  });

  it('un token vigente deja de servir si se desactiva la cuenta o se le quita el rol', async () => {
    const rol = await prisma.usuarioRol.findFirstOrThrow({
      where: { usuario: { correo: `e2e-inv-admin-${sufijo}@itp.edu.co` } },
    });
    expect((await http.get('/api/bloques').set(auth(admin))).status).toBe(200);

    await prisma.usuarioRol.delete({ where: { id: rol.id } });
    expect((await http.get('/api/bloques').set(auth(admin))).status).toBe(403);

    await prisma.usuario.update({
      where: { correo: `e2e-inv-admin-${sufijo}@itp.edu.co` },
      data: { activo: false },
    });
    const res = await http.get('/api/bloques').set(auth(admin));
    expect(res.status).toBe(401);
    expect(cuerpo(res).codigo).toBe('NO_AUTENTICADO');
  });
});
