import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
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
      });
    expect(creado.status).toBe(201);
    espacioId = (
      await prisma.espacio.findUniqueOrThrow({
        where: { codigo: codigoEspacio },
      })
    ).id;

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
