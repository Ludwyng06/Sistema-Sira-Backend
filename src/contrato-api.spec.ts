import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module.js';
import { PrismaService } from './shared/prisma/prisma.service.js';

interface Operacion {
  summary?: string;
  description?: string;
  responses: Record<string, { content?: Record<string, { schema: { $ref?: string } }> }>;
  security?: Record<string, unknown[]>[];
}

type Documento = Record<string, Record<string, Operacion>>;

const METODOS = ['get', 'post', 'put', 'patch', 'delete'];

/**
 * Operaciones del módulo de ejemplo (inventario, Fase 0) y la salud: su documentación Swagger la
 * mantiene la rama de inventario y no sigue todavía la convención de descripción con «Errores:».
 */
const EXENTAS_DE_CONVENCION = [/^\/api\/salud$/, /^\/api\/sedes/, /^\/api\/espacios/, /^\/api\/tipos-espacio$/];
const esExenta = (ruta: string): boolean => EXENTAS_DE_CONVENCION.some((r) => r.test(ruta));

/** Estados que, si una operación los declara, deben explicarse en la línea «Errores:». */
const ESTADOS_DE_DOMINIO = ['404', '409', '422', '503'];

describe('Contrato de la API completa (Swagger)', () => {
  let app: INestApplication;
  let rutas: { clave: string; ruta: string; metodo: string; op: Operacion }[];

  beforeAll(async () => {
    process.env.DATABASE_URL ??= 'postgresql://prueba:prueba@localhost:5432/prueba';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    const documento = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .addBearerAuth()
        .addCookieAuth('sira_refresh', undefined, 'sira_refresh')
        .build(),
    );
    const paths = documento.paths as unknown as Documento;
    rutas = Object.entries(paths).flatMap(([ruta, metodos]) =>
      Object.entries(metodos)
        .filter(([metodo]) => METODOS.includes(metodo))
        .map(([metodo, op]) => ({ clave: `${metodo.toUpperCase()} ${ruta}`, ruta, metodo, op })),
    );
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('publica los endpoints de todos los módulos del plan', () => {
    const claves = new Set(rutas.map((r) => r.clave));
    for (const esperada of [
      'POST /api/auth/ingresar',
      'GET /api/espacios',
      'GET /api/disponibilidad',
      'GET /api/disponibilidad/buscar',
      'GET /api/disponibilidad/sede',
      'POST /api/bloqueos',
      'POST /api/bloqueos/importar-horario',
      'POST /api/tarifas/calcular',
      'GET /api/servicios',
      'POST /api/solicitudes',
      'POST /api/solicitudes/{id}/enviar',
      'POST /api/solicitudes/{id}/decisiones',
      'POST /api/solicitudes/{id}/cancelar',
      'POST /api/solicitudes/{id}/documentos',
      'POST /api/pagos/ordenes',
      'POST /api/pagos/ordenes/{id}/verificacion',
      'POST /api/actas',
      'GET /api/notificaciones',
      'GET /api/reportes/tablero',
      'GET /api/auditoria',
      'GET /api/usuarios',
      'GET /api/dependencias',
      'GET /api/parametros',
      'GET /api/tarifas',
      'GET /api/proveedores',
      'POST /api/espacios/{id}/fotos',
      'GET /api/fotos/{id}/{variante}',
    ]) {
      expect(claves.has(esperada), esperada).toBe(true);
    }
  });

  it('ningún endpoint responde 501: todo el contrato publicado está implementado', () => {
    const con501 = rutas.filter((r) => '501' in r.op.responses).map((r) => r.clave);
    expect(con501).toEqual([]);
  });

  it('todo endpoint tiene resumen y descripción', () => {
    const sinTexto = rutas
      .filter((r) => !esExenta(r.ruta) && (!r.op.summary || !(r.op.description ?? '').trim()))
      .map((r) => r.clave);
    expect(sinTexto).toEqual([]);
  });

  it('todo estado de error documenta el DTO de error del proyecto', () => {
    const incorrectos: string[] = [];
    for (const { clave, ruta, op } of rutas) {
      if (esExenta(ruta)) continue;
      for (const [estado, respuesta] of Object.entries(op.responses)) {
        if (Number(estado) < 400) continue;
        const referencias = Object.values(respuesta.content ?? {}).map((c) => c.schema.$ref);
        if (!referencias.includes('#/components/schemas/RespuestaErrorDto')) {
          incorrectos.push(`${clave} ${estado}`);
        }
      }
    }
    expect(incorrectos).toEqual([]);
  });

  it('los errores de dominio documentados se explican en la línea «Errores:» de la descripción', () => {
    const sinExplicar = rutas
      .filter(
        (r) =>
          !esExenta(r.ruta) &&
          ESTADOS_DE_DOMINIO.some((e) => e in r.op.responses) &&
          !(r.op.description ?? '').includes('Errores:'),
      )
      .map((r) => r.clave);
    expect(sinExplicar).toEqual([]);
  });

  it('todo endpoint no público exige el token de acceso', () => {
    const publicos = rutas
      .filter((r) => !(r.op.security ?? []).some((s) => 'bearer' in s))
      .map((r) => r.clave)
      .sort();

    expect(publicos).toEqual([
      'GET /api/disponibilidad',
      'GET /api/disponibilidad/buscar',
      'GET /api/disponibilidad/sede',
      'GET /api/espacios',
      'GET /api/espacios/{codigo}',
      'GET /api/fotos/{id}/{variante}',
      'GET /api/salud',
      'GET /api/sedes',
      'GET /api/sedes/{sede}/bloques',
      'GET /api/sedes/{sede}/bloques/{bloque}',
      'GET /api/servicios',
      'GET /api/tipos-espacio',
      'POST /api/auth/recuperar',
      'POST /api/auth/refrescar',
      'POST /api/auth/registro',
      'POST /api/auth/reenviar-codigo',
      'POST /api/auth/restablecer',
      'POST /api/auth/verificar-correo',
      'POST /api/auth/ingresar',
      'POST /api/tarifas/calcular',
    ].sort());
  });
});
