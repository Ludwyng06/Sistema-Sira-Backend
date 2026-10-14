import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CLAVE_PUBLICO } from '../../shared/auth/decoradores.js';
import { FiltroErrores } from '../../shared/errores/filtro-errores.js';
import { AuthController } from './controllers/auth.controller.js';
import { IdentidadModule } from './identidad.module.js';

interface Operacion {
  requestBody?: { content: Record<string, { schema: { $ref: string } }> };
  responses: Record<string, { content?: Record<string, { schema: { $ref?: string } }> }>;
  security?: Record<string, unknown[]>[];
}

interface Caso {
  metodo: 'get' | 'post';
  ruta: string;
  handler: keyof AuthController;
  publico: boolean;
  entrada?: string;
  exito: string;
  esquemaExito?: string;
  errores: string[];
  cuerpo?: Record<string, unknown>;
}

const registroValido = {
  correo: 'ana@ejemplo.com',
  contrasena: 'Clave-segura-2026',
  tipo: 'PERSONA_NATURAL',
  nombres: 'Ana',
  tipoDocumento: 'CC',
  numeroDocumento: '1020304050',
  telefono: '3001234567',
  aceptaPoliticaDatos: true,
  versionPolitica: '2026-01',
};

const CASOS: Caso[] = [
  {
    metodo: 'post', ruta: '/api/auth/registro', handler: 'registrar', publico: true,
    entrada: 'RegistroDto', exito: '201', esquemaExito: 'RegistroRespuestaDto',
    errores: ['400', '409', '429', '501'], cuerpo: registroValido,
  },
  {
    metodo: 'post', ruta: '/api/auth/verificar-correo', handler: 'verificarCorreo', publico: true,
    entrada: 'VerificarCorreoDto', exito: '200', esquemaExito: 'MensajeDto',
    errores: ['400', '422', '429', '501'], cuerpo: { correo: 'ana@ejemplo.com', codigo: '482913' },
  },
  {
    metodo: 'post', ruta: '/api/auth/reenviar-codigo', handler: 'reenviarCodigo', publico: true,
    entrada: 'ReenviarCodigoDto', exito: '200', esquemaExito: 'MensajeDto',
    errores: ['400', '429', '501'], cuerpo: { correo: 'ana@ejemplo.com' },
  },
  {
    metodo: 'post', ruta: '/api/auth/ingresar', handler: 'ingresar', publico: true,
    entrada: 'IngresarDto', exito: '200', esquemaExito: 'SesionDto',
    errores: ['400', '401', '429', '501'], cuerpo: { correo: 'ana@ejemplo.com', contrasena: 'x' },
  },
  {
    metodo: 'post', ruta: '/api/auth/refrescar', handler: 'refrescar', publico: true,
    exito: '200', esquemaExito: 'SesionDto', errores: ['401', '429', '501'],
  },
  {
    metodo: 'post', ruta: '/api/auth/salir', handler: 'salir', publico: false,
    exito: '204', errores: ['401', '501'],
  },
  {
    metodo: 'post', ruta: '/api/auth/recuperar', handler: 'recuperar', publico: true,
    entrada: 'RecuperarDto', exito: '200', esquemaExito: 'MensajeDto',
    errores: ['400', '429', '501'], cuerpo: { correo: 'ana@ejemplo.com' },
  },
  {
    metodo: 'post', ruta: '/api/auth/restablecer', handler: 'restablecer', publico: true,
    entrada: 'RestablecerDto', exito: '200', esquemaExito: 'MensajeDto',
    errores: ['400', '422', '429', '501'], cuerpo: { token: 'abc123', contrasenaNueva: 'Nueva-clave-2026' },
  },
  {
    metodo: 'get', ruta: '/api/auth/yo', handler: 'yo', publico: false,
    exito: '200', esquemaExito: 'UsuarioSesionDto', errores: ['401', '501'],
  },
];

describe('Contrato de identidad /api/auth/*', () => {
  let app: INestApplication;
  let paths: Record<string, Record<string, Operacion>>;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]), IdentidadModule],
    }).compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new FiltroErrores());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    const documento = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .addBearerAuth()
        .addCookieAuth('sira_refresh', undefined, 'sira_refresh')
        .build(),
    );
    paths = documento.paths as unknown as typeof paths;
  });

  afterAll(async () => {
    await app.close();
  });

  const operacion = (c: Caso): Operacion => {
    const op = paths[c.ruta]?.[c.metodo];
    expect(op, `${c.metodo.toUpperCase()} ${c.ruta}`).toBeDefined();
    return op as Operacion;
  };

  it('publica exactamente los nueve pares método + ruta bajo /api/auth', () => {
    const publicados = Object.entries(paths)
      .filter(([ruta]) => ruta.startsWith('/api/auth'))
      .flatMap(([ruta, metodos]) => Object.keys(metodos).map((m) => `${m.toUpperCase()} ${ruta}`))
      .sort();
    const esperados = CASOS.map((c) => `${c.metodo.toUpperCase()} ${c.ruta}`).sort();
    expect(publicados).toEqual(esperados);
  });

  describe.each(CASOS)('$metodo $ruta', (caso) => {
    it('referencia el esquema de entrada y el de éxito', () => {
      const op = operacion(caso);
      if (caso.entrada) {
        expect(op.requestBody?.content['application/json']?.schema.$ref).toBe(
          `#/components/schemas/${caso.entrada}`,
        );
      } else {
        expect(op.requestBody).toBeUndefined();
      }
      const exito = op.responses[caso.exito];
      expect(exito).toBeDefined();
      if (caso.esquemaExito) {
        expect(exito?.content?.['application/json']?.schema.$ref).toBe(
          `#/components/schemas/${caso.esquemaExito}`,
        );
      } else {
        expect(exito?.content).toBeUndefined();
      }
    });

    it('documenta exactamente los estados de error con RespuestaErrorDto', () => {
      const op = operacion(caso);
      const errores = Object.keys(op.responses).filter((s) => s !== caso.exito);
      expect(errores.sort()).toEqual([...caso.errores].sort());
      for (const estado of caso.errores) {
        expect(op.responses[estado]?.content?.['application/json']?.schema.$ref).toBe(
          '#/components/schemas/RespuestaErrorDto',
        );
      }
    });

    it('declara la seguridad que le corresponde', () => {
      const claves = (operacion(caso).security ?? []).flatMap((s) => Object.keys(s));
      expect(claves.includes('bearer')).toBe(!caso.publico);
      expect(claves.includes('sira_refresh')).toBe(caso.handler === 'refrescar');
    });

    it('queda marcado como público solo si corresponde', () => {
      const reflector = new Reflector();
      const metodo = AuthController.prototype[caso.handler] as (...a: never[]) => unknown;
      expect(reflector.get<boolean | undefined>(CLAVE_PUBLICO, metodo) === true).toBe(caso.publico);
    });

    it('responde 501 NO_IMPLEMENTADO con entrada válida', async () => {
      const peticion = request(app.getHttpServer())[caso.metodo](caso.ruta);
      const res = await (caso.cuerpo ? peticion.send(caso.cuerpo) : peticion).set(
        'x-correlation-id',
        'prueba-contrato',
      );
      expect(res.status).toBe(501);
      expect(res.body).toMatchObject({
        codigo: 'NO_IMPLEMENTADO',
        mensaje: expect.any(String),
        correlacionId: 'prueba-contrato',
      });
    });
  });

  it('registro con cuerpo inválido responde 400 DATOS_INVALIDOS con detalles.campos', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({ ...registroValido, correo: 'no-es-correo', contrasena: 'corta' });
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('DATOS_INVALIDOS');
    expect(Array.isArray(res.body.detalles.campos)).toBe(true);
    expect(res.body.detalles.campos.length).toBeGreaterThan(0);
  });

  it('registro con una propiedad desconocida responde 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({ ...registroValido, rol: 'ADMINISTRADOR' });
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('DATOS_INVALIDOS');
  });
});
