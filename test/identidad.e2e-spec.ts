import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TipoDocumentoIdentidad, TipoSolicitante, Rol } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/shared/prisma/prisma.service.js';
import { crearAppPrueba } from './utilidades/app-prueba.js';
import { consultarCorreos, esperarUltimoCorreo } from './utilidades/mailpit.js';

const sufijo = randomUUID().replaceAll('-', '').slice(0, 12);
let versionPolitica = '';
const agente = 'SIRA-Mision-10-E2E';
const correoInterno = `  mision10-${sufijo}@ITP.EDU.CO  `;
const correoInternoNormalizado = `mision10-${sufijo}@itp.edu.co`;
const correoEmpresa = `mision10-empresa-${sufijo}@example.com`;
const correoNoExistente = `mision10-ausente-${sufijo}@example.com`;
const documentoInterno = `10${sufijo}`;
const documentoAgotado = `20${sufijo}`;
let codigoCorreoInterno = '';

function codigoDistinto(codigo: string): string {
  return codigo === '000000' ? '000001' : '000000';
}

function datosRegistro(
  correo: string,
  numeroDocumento: string,
  tipo: TipoSolicitante = TipoSolicitante.PERSONA_NATURAL,
  politica = versionPolitica,
) {
  return {
    correo,
    contrasena: 'Clave-segura-Mision-10',
    tipo,
    nombres: 'Prueba Misión',
    apellidos: 'Punta a punta',
    ...(tipo === TipoSolicitante.EMPRESA ? { razonSocial: `Empresa ${sufijo}` } : {}),
    tipoDocumento: TipoDocumentoIdentidad.CC,
    numeroDocumento,
    telefono: '+573001234567',
    aceptaPoliticaDatos: true,
    versionPolitica: politica,
  };
}

describe.sequential('Registro y verificación de identidad contra servicios reales', () => {
  let app: Awaited<ReturnType<typeof crearAppPrueba>>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await crearAppPrueba();
    prisma = app.get(PrismaService);
    const parametro = await prisma.parametro.findUniqueOrThrow({
      where: { clave: 'version_politica_datos' },
      select: { valor: true },
    });
    if (typeof parametro.valor !== 'string') {
      throw new Error('El parámetro version_politica_datos debe contener texto.');
    }
    versionPolitica = parametro.valor;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('registra una cuenta institucional, guarda sus relaciones y entrega el código por correo', async () => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/registro')
      .set('User-Agent', agente)
      .send(datosRegistro(correoInterno, documentoInterno));

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      correo: correoInternoNormalizado,
      esInstitucional: true,
      correoVerificado: false,
    });

    const correo = await esperarUltimoCorreo(correoInternoNormalizado);
    expect(correo.asunto).toMatch(/^\d{6}\b/);
    expect(correo.html).toContain(correo.asunto.slice(0, 6));
    expect(correo.texto).toContain(correo.asunto.slice(0, 6));
    const codigo = correo.asunto.slice(0, 6);
    codigoCorreoInterno = codigo;

    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { correo: correoInternoNormalizado },
      include: {
        solicitante: true,
        roles: true,
        consentimientos: true,
        codigosVerificacion: { where: { proposito: 'VERIFICAR_CORREO' } },
      },
    });
    const politica = await prisma.parametro.findUniqueOrThrow({
      where: { clave: 'version_politica_datos' },
    });

    expect(usuario.hashContrasena.startsWith('$argon2id$')).toBe(true);
    expect(usuario.esInstitucional).toBe(true);
    expect(usuario.correoVerificado).toBe(false);
    expect(usuario.solicitante?.tipo).toBe(TipoSolicitante.INTERNO);
    expect(usuario.roles.map((rol) => rol.rol)).toContain(Rol.SOLICITANTE);
    expect(usuario.consentimientos).toHaveLength(1);
    expect(usuario.consentimientos[0]?.versionPolitica).toBe(politica.valor);
    expect(usuario.consentimientos[0]?.ip.length).toBeGreaterThan(0);
    expect(usuario.consentimientos[0]?.userAgent).toBe(agente);
    expect(usuario.codigosVerificacion).toHaveLength(1);
    const registroCodigo = usuario.codigosVerificacion[0];
    if (!registroCodigo) throw new Error('No se encontró el código de verificación del registro.');
    expect(registroCodigo.hashCodigo).toMatch(/^\$argon2id\$/);
    expect(await argon2.verify(registroCodigo.hashCodigo, codigo)).toBe(true);
  });

  it('rechaza correos y documentos ya registrados', async () => {
    const correoDuplicado = await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send(datosRegistro(correoInternoNormalizado, documentoInterno));
    expect(correoDuplicado.status).toBe(409);
    expect(correoDuplicado.body.codigo).toBe('CORREO_REGISTRADO');

    const documentoDuplicado = await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send(datosRegistro(`mision10-duplicado-${sufijo}@example.com`, documentoInterno));
    expect(documentoDuplicado.status).toBe(409);
    expect(documentoDuplicado.body.codigo).toBe('DOCUMENTO_REGISTRADO');
  });

  it('valida política y tipo de solicitante, y permite registrar empresas externas', async () => {
    const politicaAntigua = await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send(
        datosRegistro(
          `mision10-politica-${sufijo}@example.com`,
          `30${sufijo}`,
          TipoSolicitante.PERSONA_NATURAL,
          versionPolitica === 'version-inexistente' ? 'version-inexistente-antigua' : 'version-inexistente',
        ),
      );
    expect(politicaAntigua.status).toBe(422);
    expect(politicaAntigua.body.codigo).toBe('POLITICA_DESACTUALIZADA');

    const tipoInternoExterno = await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send(
        datosRegistro(
          `mision10-interno-externo-${sufijo}@example.com`,
          `40${sufijo}`,
          TipoSolicitante.INTERNO,
        ),
      );
    expect(tipoInternoExterno.status).toBe(422);
    expect(tipoInternoExterno.body.codigo).toBe('TIPO_SOLICITANTE_INVALIDO');

    const empresa = await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send(datosRegistro(correoEmpresa, `50${sufijo}`, TipoSolicitante.EMPRESA));
    expect(empresa.status).toBe(201);
    expect(empresa.body.esInstitucional).toBe(false);

    const solicitanteEmpresa = await prisma.solicitante.findUniqueOrThrow({
      where: { usuarioId: empresa.body.id },
    });
    expect(solicitanteEmpresa.tipo).toBe(TipoSolicitante.EMPRESA);
  });

  it('limita intentos, rechaza reenvíos recientes y verifica con el código vigente', async () => {
    const incorrecto = await request(app.getHttpServer())
      .post('/api/auth/verificar-correo')
      .send({ correo: correoInternoNormalizado, codigo: codigoDistinto(codigoCorreoInterno) });
    expect(incorrecto.status).toBe(422);
    expect(incorrecto.body.codigo).toBe('CODIGO_INVALIDO');
    expect(incorrecto.body.detalles.intentosRestantes).toBe(4);

    const reenvioReciente = await request(app.getHttpServer())
      .post('/api/auth/reenviar-codigo')
      .send({ correo: correoInternoNormalizado });
    expect(reenvioReciente.status).toBe(429);
    expect(reenvioReciente.body.codigo).toBe('CODIGO_RECIENTE');

    const correo = await esperarUltimoCorreo(correoInternoNormalizado);
    const codigo = correo.asunto.slice(0, 6);
    const verificacion = await request(app.getHttpServer())
      .post('/api/auth/verificar-correo')
      .send({ correo: correoInternoNormalizado, codigo });
    expect(verificacion.status).toBe(200);
    expect(verificacion.body.mensaje).toBe('Tu correo quedó verificado. Ya puedes ingresar.');

    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { correo: correoInternoNormalizado },
      include: { codigosVerificacion: { where: { proposito: 'VERIFICAR_CORREO' } } },
    });
    expect(usuario.correoVerificado).toBe(true);
    expect(usuario.codigosVerificacion[0]?.usadoEn).toBeInstanceOf(Date);

    const repetida = await request(app.getHttpServer())
      .post('/api/auth/verificar-correo')
      .send({ correo: correoInternoNormalizado, codigo });
    expect(repetida.status).toBe(200);
    expect(repetida.body.mensaje).toBe('Tu correo ya está verificado.');
  });

  it('agota los intentos y mantiene genérico el reenvío a un correo inexistente', async () => {
    const registro = await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send(datosRegistro(`mision10-agotado-${sufijo}@example.com`, documentoAgotado));
    expect(registro.status).toBe(201);

    const correo = await esperarUltimoCorreo(registro.body.correo);
    const codigoCorrecto = correo.asunto.slice(0, 6);

    for (let intento = 1; intento <= 5; intento += 1) {
      const respuesta = await request(app.getHttpServer())
        .post('/api/auth/verificar-correo')
        .send({ correo: registro.body.correo, codigo: codigoDistinto(codigoCorrecto) });
      expect(respuesta.status).toBe(422);
      expect(respuesta.body.codigo).toBe(intento === 5 ? 'CODIGO_AGOTADO' : 'CODIGO_INVALIDO');
    }

    const correctoDespuesDeAgotar = await request(app.getHttpServer())
      .post('/api/auth/verificar-correo')
      .send({ correo: registro.body.correo, codigo: codigoCorrecto });
    expect(correctoDespuesDeAgotar.status).toBe(422);
    expect(correctoDespuesDeAgotar.body.codigo).toBe('CODIGO_AGOTADO');

    const reenvio = await request(app.getHttpServer())
      .post('/api/auth/reenviar-codigo')
      .send({ correo: correoNoExistente });
    expect(reenvio.status).toBe(200);
    expect(reenvio.body.mensaje).toBe(
      'Si la cuenta existe y no está verificada, te enviamos un código nuevo.',
    );
    expect(await consultarCorreos(correoNoExistente)).toHaveLength(0);
  });
});
