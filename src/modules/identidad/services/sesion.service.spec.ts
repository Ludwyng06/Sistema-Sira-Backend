import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CargaJwt } from '../../../shared/auth/jwt.strategy.js';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { GRACIA_REFRESCO_MS, SesionService } from './sesion.service.js';

const USUARIO_ID = '3f2b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';
const DEP_A = '8a3b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a01';
const DEP_B = '8a3b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a02';
const FAMILIA = '11111111-2222-4333-8444-555555555555';
const CONTEXTO = { ip: '10.0.0.1', userAgent: 'vitest' };

function usuarioBase(sobrescribir: Record<string, unknown> = {}) {
  return {
    id: USUARIO_ID,
    correo: 'ana@uniputumayo.edu.co',
    correoVerificado: true,
    esInstitucional: true,
    activo: true,
    roles: [
      { rol: 'DIRECTOR_DEPENDENCIA', dependenciaId: DEP_A },
      { rol: 'DIRECTOR_DEPENDENCIA', dependenciaId: DEP_B },
      { rol: 'SOLICITANTE', dependenciaId: null },
    ],
    solicitante: null,
    dependenciasJefe: [{ id: DEP_A }],
    ...sobrescribir,
  };
}

function crearEntorno() {
  const tablaSesion = {
    create: vi.fn().mockResolvedValue({}),
    findUnique: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const tablaUsuario = { findUnique: vi.fn().mockResolvedValue(usuarioBase()) };
  const tx = { sesionRefresh: tablaSesion };
  const prisma = {
    sesionRefresh: tablaSesion,
    usuario: tablaUsuario,
    $transaction: vi.fn(async (fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const jwt = new JwtService({ secret: 'secreto-de-prueba', signOptions: { expiresIn: '15m' } });
  const config = { getOrThrow: vi.fn(() => 7) };
  const servicio = new SesionService(
    prisma as unknown as PrismaService,
    jwt,
    config as unknown as ConfigService,
  );
  return { servicio, jwt, prisma, tablaSesion, tablaUsuario, tx };
}

async function capturar(promesa: Promise<unknown>): Promise<ErrorDominio> {
  try {
    await promesa;
  } catch (error) {
    return error as ErrorDominio;
  }
  throw new Error('Se esperaba un error y no se produjo.');
}

function sesionGuardada(sobrescribir: Record<string, unknown> = {}) {
  return {
    id: 'sesion-1',
    usuarioId: USUARIO_ID,
    familia: FAMILIA,
    expiraEn: new Date(Date.now() + 3_600_000),
    revocadoEn: null,
    usuario: { activo: true },
    ...sobrescribir,
  };
}

describe('SesionService', () => {
  let entorno: ReturnType<typeof crearEntorno>;

  beforeEach(() => {
    entorno = crearEntorno();
  });

  describe('iniciar', () => {
    it('emite un JWT con exactamente la carga esperada, sin dependencias repetidas', async () => {
      const emitida = await entorno.servicio.iniciar(USUARIO_ID, CONTEXTO);
      const carga = entorno.jwt.decode<CargaJwt & { exp: number; iat: number }>(emitida.accessToken);

      const { exp, iat, ...resto } = carga;
      expect(Object.keys(resto).sort()).toEqual(
        ['correo', 'dependencias', 'institucional', 'roles', 'sub', 'verificado'].sort(),
      );
      expect(resto).toEqual({
        sub: USUARIO_ID,
        correo: 'ana@uniputumayo.edu.co',
        roles: ['DIRECTOR_DEPENDENCIA', 'SOLICITANTE'],
        dependencias: [DEP_A, DEP_B],
        verificado: true,
        institucional: true,
      });
      expect(emitida.expiraEn).toBe(exp - iat);
      expect(emitida.expiraEn).toBe(900);
    });

    it('incluye la dependencia del jefe aunque no tenga fila de rol', async () => {
      entorno.tablaUsuario.findUnique.mockResolvedValue(
        usuarioBase({ roles: [{ rol: 'SOLICITANTE', dependenciaId: null }], dependenciasJefe: [{ id: DEP_B }] }),
      );
      const emitida = await entorno.servicio.iniciar(USUARIO_ID, CONTEXTO);
      const carga = entorno.jwt.decode<CargaJwt>(emitida.accessToken);
      expect(carga.dependencias).toEqual([DEP_B]);
    });

    it('guarda solo el sha256 del refresh, con familia nueva y vigencia en días', async () => {
      const antes = Date.now();
      const emitida = await entorno.servicio.iniciar(USUARIO_ID, CONTEXTO);

      expect(emitida.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const { data } = entorno.tablaSesion.create.mock.calls[0]![0] as { data: Record<string, unknown> };
      expect(data.hashToken).toBe(createHash('sha256').update(emitida.refreshToken).digest('hex'));
      expect(data.hashToken).not.toBe(emitida.refreshToken);
      expect(data.familia).toMatch(/^[0-9a-f-]{36}$/);
      expect(data).toMatchObject({ usuarioId: USUARIO_ID, ip: '10.0.0.1', userAgent: 'vitest' });
      expect(emitida.refreshExpiraEn.getTime()).toBeGreaterThanOrEqual(antes + 7 * 86_400_000);
      expect(data.expiraEn).toEqual(emitida.refreshExpiraEn);
    });

    it('rechaza a un usuario inactivo', async () => {
      entorno.tablaUsuario.findUnique.mockResolvedValue(usuarioBase({ activo: false }));
      const error = await capturar(entorno.servicio.iniciar(USUARIO_ID, CONTEXTO));
      expect(error.codigo).toBe('SESION_INVALIDA');
    });
  });

  describe('rotar', () => {
    it('revoca el token anterior y crea uno nuevo en la misma familia, en una transacción', async () => {
      entorno.tablaSesion.findUnique.mockResolvedValue(sesionGuardada());
      const emitida = await entorno.servicio.rotar('token-viejo', CONTEXTO);

      expect(entorno.prisma.$transaction).toHaveBeenCalledOnce();
      expect(entorno.tablaSesion.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { hashToken: createHash('sha256').update('token-viejo').digest('hex') },
        }),
      );
      expect(entorno.tablaSesion.updateMany).toHaveBeenCalledWith({
        where: { id: 'sesion-1', revocadoEn: null },
        data: { revocadoEn: expect.any(Date) },
      });
      const { data } = entorno.tablaSesion.create.mock.calls[0]![0] as { data: Record<string, unknown> };
      expect(data.familia).toBe(FAMILIA);
      expect(data.hashToken).toBe(createHash('sha256').update(emitida.refreshToken).digest('hex'));
    });

    it('un token revocado hace tiempo es reuso: revoca toda la familia y da SESION_REVOCADA', async () => {
      const hace = new Date(Date.now() - GRACIA_REFRESCO_MS - 1_000);
      entorno.tablaSesion.findUnique.mockResolvedValue(sesionGuardada({ revocadoEn: hace }));
      const error = await capturar(entorno.servicio.rotar('token-viejo', CONTEXTO));

      expect(error.codigo).toBe('SESION_REVOCADA');
      expect(error.status).toBe(401);
      expect(entorno.tablaSesion.updateMany).toHaveBeenCalledWith({
        where: { familia: FAMILIA, revocadoEn: null },
        data: { revocadoEn: expect.any(Date) },
      });
      expect(entorno.tablaSesion.create).not.toHaveBeenCalled();
    });

    it('un token rotado hace segundos (otra pestaña) da REFRESCO_CONCURRENTE sin revocar la familia', async () => {
      const hace = new Date(Date.now() - 2_000);
      entorno.tablaSesion.findUnique.mockResolvedValue(sesionGuardada({ revocadoEn: hace }));
      const error = await capturar(entorno.servicio.rotar('token-viejo', CONTEXTO));

      expect(error.codigo).toBe('REFRESCO_CONCURRENTE');
      expect(error.status).toBe(401);
      expect(entorno.tablaSesion.updateMany).not.toHaveBeenCalled();
      expect(entorno.tablaSesion.create).not.toHaveBeenCalled();
    });

    it('count 0 en la revocación atómica (carrera de dos refrescos) no revoca la familia', async () => {
      entorno.tablaSesion.findUnique.mockResolvedValue(sesionGuardada());
      entorno.tablaSesion.updateMany.mockResolvedValueOnce({ count: 0 });
      const error = await capturar(entorno.servicio.rotar('token', CONTEXTO));

      expect(error.codigo).toBe('REFRESCO_CONCURRENTE');
      expect(entorno.tablaSesion.create).not.toHaveBeenCalled();
      expect(entorno.tablaSesion.updateMany).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['inexistente', null],
      ['vencido', sesionGuardada({ expiraEn: new Date(Date.now() - 1000) })],
      ['de usuario inactivo', sesionGuardada({ usuario: { activo: false } })],
    ])('un token %s da SESION_INVALIDA', async (_caso, sesion) => {
      entorno.tablaSesion.findUnique.mockResolvedValue(sesion);
      const error = await capturar(entorno.servicio.rotar('token', CONTEXTO));

      expect(error.codigo).toBe('SESION_INVALIDA');
      expect(error.message).toBe('Tu sesión terminó. Ingresa de nuevo.');
      expect(error.status).toBe(401);
      expect(entorno.tablaSesion.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('cerrar', () => {
    it('con null no consulta nada', async () => {
      await entorno.servicio.cerrar(null);
      expect(entorno.tablaSesion.updateMany).not.toHaveBeenCalled();
      expect(entorno.tablaSesion.findUnique).not.toHaveBeenCalled();
    });

    it('revoca solo la sesión del token', async () => {
      await entorno.servicio.cerrar('abc');
      expect(entorno.tablaSesion.updateMany).toHaveBeenCalledWith({
        where: { hashToken: createHash('sha256').update('abc').digest('hex'), revocadoEn: null },
        data: { revocadoEn: expect.any(Date) },
      });
    });
  });

  describe('revocarTodas', () => {
    it('revoca las sesiones vigentes del usuario', async () => {
      await entorno.servicio.revocarTodas(USUARIO_ID);
      expect(entorno.tablaSesion.updateMany).toHaveBeenCalledWith({
        where: { usuarioId: USUARIO_ID, revocadoEn: null },
        data: { revocadoEn: expect.any(Date) },
      });
    });

    it('usa el cliente de la transacción si se le pasa', async () => {
      const updateMany = vi.fn().mockResolvedValue({ count: 3 });
      await entorno.servicio.revocarTodas(USUARIO_ID, { sesionRefresh: { updateMany } } as never);
      expect(updateMany).toHaveBeenCalledOnce();
      expect(entorno.tablaSesion.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('datosUsuario', () => {
    it('arma roles y perfil', async () => {
      entorno.tablaUsuario.findUnique.mockResolvedValue(
        usuarioBase({
          solicitante: {
            tipo: 'PERSONA_NATURAL',
            nombres: 'Ana',
            apellidos: 'Pérez',
            razonSocial: null,
            tipoDocumento: 'CC',
            numeroDocumento: '1020',
            telefono: '+573001234567',
            dependenciaId: DEP_A,
            direccion: 'no debe salir',
          },
        }),
      );
      const datos = await entorno.servicio.datosUsuario(USUARIO_ID);

      expect(datos.roles).toEqual([
        { rol: 'DIRECTOR_DEPENDENCIA', dependenciaId: DEP_A },
        { rol: 'DIRECTOR_DEPENDENCIA', dependenciaId: DEP_B },
        { rol: 'SOLICITANTE', dependenciaId: null },
      ]);
      expect(datos.perfil).toEqual({
        tipo: 'PERSONA_NATURAL',
        nombres: 'Ana',
        apellidos: 'Pérez',
        razonSocial: null,
        tipoDocumento: 'CC',
        numeroDocumento: '1020',
        telefono: '+573001234567',
        dependenciaId: DEP_A,
      });
      expect(datos).toMatchObject({ id: USUARIO_ID, correoVerificado: true, esInstitucional: true });
    });

    it('perfil es null sin solicitante', async () => {
      const datos = await entorno.servicio.datosUsuario(USUARIO_ID);
      expect(datos.perfil).toBeNull();
    });

    it.each([['no existe', null], ['está inactivo', usuarioBase({ activo: false })]])(
      'SESION_INVALIDA si el usuario %s',
      async (_caso, usuario) => {
        entorno.tablaUsuario.findUnique.mockResolvedValue(usuario);
        const error = await capturar(entorno.servicio.datosUsuario(USUARIO_ID));
        expect(error.codigo).toBe('SESION_INVALIDA');
        expect(error.status).toBe(401);
      },
    );
  });
});
