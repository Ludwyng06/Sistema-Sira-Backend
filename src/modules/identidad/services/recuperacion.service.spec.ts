import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import type { ParametroService } from '../../../shared/parametros/parametro.service.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { CorreoPort } from '../../notificaciones/correo/correo.port.js';
import type { RecuperarDto } from '../dto/recuperar.dto.js';
import type { RestablecerDto } from '../dto/restablecer.dto.js';
import { RecuperacionService } from './recuperacion.service.js';
import type { SesionService } from './sesion.service.js';

const AHORA = new Date('2026-10-15T15:00:00.000Z');
const USUARIO_ID = '3f2b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';
const CODIGO_ID = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a';
const CORREO = 'ana@ejemplo.com';
const SECRETO = 'c2VjcmV0by1kZS1wcnVlYmEtYWx0YS1lbnRyb3BpYS0xMjM0NQ';
const MENSAJE = 'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.';
const hashDe = (secreto: string): string => createHash('sha256').update(secreto).digest('hex');

interface Registro {
  id: string;
  usuarioId: string;
  hashCodigo: string;
  usuario: { activo: boolean };
}

const registroValido = (cambios: Partial<Registro> = {}): Registro => ({
  id: CODIGO_ID,
  usuarioId: USUARIO_ID,
  hashCodigo: hashDe(SECRETO),
  usuario: { activo: true },
  ...cambios,
});

function crearEntorno() {
  const tablaCodigo = {
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    create: vi.fn().mockResolvedValue({ id: CODIGO_ID }),
    findFirst: vi.fn(),
  };
  const tablaUsuario = { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) };
  const tx = { codigoVerificacion: tablaCodigo, usuario: tablaUsuario };
  const prisma = {
    usuario: tablaUsuario,
    codigoVerificacion: tablaCodigo,
    $transaction: vi.fn(async (fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const parametros = { obtenerNumero: vi.fn().mockResolvedValue(30) };
  const sesiones = { revocarTodas: vi.fn().mockResolvedValue(undefined) };
  const config = { getOrThrow: vi.fn().mockReturnValue('https://sira.uniputumayo.edu.co/') };
  const correo = { enviar: vi.fn().mockResolvedValue(undefined) };
  const servicio = new RecuperacionService(
    prisma as unknown as PrismaService,
    parametros as unknown as ParametroService,
    sesiones as unknown as SesionService,
    config as unknown as ConfigService,
    correo as unknown as CorreoPort,
  );
  return { servicio, prisma, tx, correo, sesiones, config, tablaCodigo, tablaUsuario };
}

async function capturar(promesa: Promise<unknown>): Promise<ErrorDominio> {
  const error: unknown = await promesa.then(
    () => {
      throw new Error('Se esperaba un rechazo.');
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ErrorDominio);
  return error as ErrorDominio;
}

const usuarioActivo = { id: USUARIO_ID, correo: CORREO, activo: true, solicitante: { nombres: 'Ana' } };

describe('RecuperacionService', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AHORA);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('solicitar', () => {
    const datos = { correo: CORREO } as RecuperarDto;

    it('responde igual si el correo no existe y no envía nada', async () => {
      const e = crearEntorno();
      e.tablaUsuario.findUnique.mockResolvedValue(null);
      await expect(e.servicio.solicitar(datos)).resolves.toEqual({ mensaje: MENSAJE });
      expect(e.correo.enviar).not.toHaveBeenCalled();
      expect(e.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('responde igual si el usuario está inactivo y no envía nada', async () => {
      const e = crearEntorno();
      e.tablaUsuario.findUnique.mockResolvedValue({ ...usuarioActivo, activo: false });
      await expect(e.servicio.solicitar(datos)).resolves.toEqual({ mensaje: MENSAJE });
      expect(e.correo.enviar).not.toHaveBeenCalled();
      expect(e.tablaCodigo.create).not.toHaveBeenCalled();
    });

    it('responde igual si el envío falla y registra el fallo sin datos sensibles', async () => {
      const e = crearEntorno();
      e.tablaUsuario.findUnique.mockResolvedValue(usuarioActivo);
      e.correo.enviar.mockRejectedValue(new Error('SMTP caído'));
      await expect(e.servicio.solicitar(datos)).resolves.toEqual({ mensaje: MENSAJE });
      const registros = JSON.stringify(vi.mocked(Logger.prototype.error).mock.calls[0]?.[0]);
      expect(registros).not.toContain(CORREO);
    });

    it('responde igual si la base de datos falla', async () => {
      const e = crearEntorno();
      e.tablaUsuario.findUnique.mockRejectedValue(new Error('sin conexión'));
      await expect(e.servicio.solicitar(datos)).resolves.toEqual({ mensaje: MENSAJE });
    });

    it('con usuario activo guarda solo el sha256, arma el token id.secreto y envía el enlace', async () => {
      const e = crearEntorno();
      e.tablaUsuario.findUnique.mockResolvedValue(usuarioActivo);
      await expect(e.servicio.solicitar(datos)).resolves.toEqual({ mensaje: MENSAJE });

      const { data } = e.tablaCodigo.create.mock.calls[0][0] as {
        data: { usuarioId: string; proposito: string; hashCodigo: string; expiraEn: Date };
      };
      expect(data.usuarioId).toBe(USUARIO_ID);
      expect(data.proposito).toBe('RECUPERAR_CONTRASENA');
      expect(data.expiraEn).toEqual(new Date(AHORA.getTime() + 30 * 60_000));
      expect(data.hashCodigo).toMatch(/^[0-9a-f]{64}$/);

      const enviado = e.correo.enviar.mock.calls[0][0] as { para: string; asunto: string; texto: string };
      expect(enviado.para).toBe(CORREO);
      const enlace = /https:\/\/\S+/.exec(enviado.texto)?.[0] ?? '';
      const url = new URL(enlace);
      expect(url.origin + url.pathname).toBe('https://sira.uniputumayo.edu.co/restablecer');
      const token = url.searchParams.get('token') ?? '';
      const [id, secreto] = token.split('.');
      expect(id).toBe(CODIGO_ID);
      expect(secreto).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(data.hashCodigo).toBe(hashDe(secreto));
      expect(data.hashCodigo).not.toContain(secreto);
      expect(JSON.stringify(e.tablaCodigo.create.mock.calls)).not.toContain(secreto);
      expect(e.config.getOrThrow).toHaveBeenCalledWith('FRONTEND_URL');
    });

    it('invalida los enlaces anteriores sin usar dentro de la misma transacción', async () => {
      const e = crearEntorno();
      e.tablaUsuario.findUnique.mockResolvedValue(usuarioActivo);
      await e.servicio.solicitar(datos);

      expect(e.prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(e.tablaCodigo.updateMany).toHaveBeenCalledWith({
        where: {
          usuarioId: USUARIO_ID,
          proposito: 'RECUPERAR_CONTRASENA',
          usadoEn: null,
          expiraEn: { gt: AHORA },
        },
        data: { expiraEn: AHORA },
      });
      const ordenInvalidar = e.tablaCodigo.updateMany.mock.invocationCallOrder[0];
      const ordenCrear = e.tablaCodigo.create.mock.invocationCallOrder[0];
      expect(ordenInvalidar).toBeLessThan(ordenCrear);
    });

    it('usa el correo como nombre si no hay solicitante', async () => {
      const e = crearEntorno();
      e.tablaUsuario.findUnique.mockResolvedValue({ ...usuarioActivo, solicitante: null });
      await e.servicio.solicitar(datos);
      expect((e.correo.enviar.mock.calls[0][0] as { texto: string }).texto).toContain(`Hola, ${CORREO}:`);
    });
  });

  describe('restablecer', () => {
    const tokenValido = `${CODIGO_ID}.${SECRETO}`;
    const peticion = (token: string): RestablecerDto =>
      ({ token, contrasenaNueva: 'Nueva-clave-2026' }) as RestablecerDto;

    async function esperarInvalido(promesa: Promise<unknown>): Promise<void> {
      const error = await capturar(promesa);
      expect(error.codigo).toBe('ENLACE_INVALIDO');
      expect(error.status).toBe(422);
      expect(error.message).toBe('El enlace no es válido o ya venció. Solicita uno nuevo.');
    }

    it.each([
      ['sin separador', 'sinpunto'],
      ['sin id', `.${SECRETO}`],
      ['sin secreto', `${CODIGO_ID}.`],
      ['id que no es UUID', `no-es-uuid.${SECRETO}`],
    ])('formato inválido (%s) -> ENLACE_INVALIDO sin consultar la base', async (_caso, token) => {
      const e = crearEntorno();
      await esperarInvalido(e.servicio.restablecer(peticion(token)));
      expect(e.tablaCodigo.findFirst).not.toHaveBeenCalled();
    });

    it('id inexistente, vencido o usado (la búsqueda no encuentra nada) -> ENLACE_INVALIDO', async () => {
      const e = crearEntorno();
      e.tablaCodigo.findFirst.mockResolvedValue(null);
      await esperarInvalido(e.servicio.restablecer(peticion(tokenValido)));
      expect(e.tablaCodigo.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: CODIGO_ID,
            proposito: 'RECUPERAR_CONTRASENA',
            usadoEn: null,
            expiraEn: { gt: AHORA },
          },
        }),
      );
      expect(e.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('secreto incorrecto -> ENLACE_INVALIDO', async () => {
      const e = crearEntorno();
      e.tablaCodigo.findFirst.mockResolvedValue(registroValido());
      await esperarInvalido(e.servicio.restablecer(peticion(`${CODIGO_ID}.otro-secreto`)));
      expect(e.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('hash almacenado corrupto -> ENLACE_INVALIDO', async () => {
      const e = crearEntorno();
      e.tablaCodigo.findFirst.mockResolvedValue(registroValido({ hashCodigo: 'zz' }));
      await esperarInvalido(e.servicio.restablecer(peticion(tokenValido)));
    });

    it('usuario inactivo -> ENLACE_INVALIDO', async () => {
      const e = crearEntorno();
      e.tablaCodigo.findFirst.mockResolvedValue(registroValido({ usuario: { activo: false } }));
      await esperarInvalido(e.servicio.restablecer(peticion(tokenValido)));
    });

    it('carrera: otro proceso lo usó antes (count 0) -> ENLACE_INVALIDO sin tocar al usuario', async () => {
      const e = crearEntorno();
      e.tablaCodigo.findFirst.mockResolvedValue(registroValido());
      e.tablaCodigo.updateMany.mockResolvedValue({ count: 0 });
      await esperarInvalido(e.servicio.restablecer(peticion(tokenValido)));
      expect(e.tablaCodigo.updateMany).toHaveBeenCalledWith({
        where: { id: CODIGO_ID, usadoEn: null },
        data: { usadoEn: AHORA },
      });
      expect(e.tablaUsuario.update).not.toHaveBeenCalled();
      expect(e.sesiones.revocarTodas).not.toHaveBeenCalled();
    });

    it('éxito: guarda argon2id, desbloquea, verifica el correo y revoca sesiones con el tx', async () => {
      const e = crearEntorno();
      e.tablaCodigo.findFirst.mockResolvedValue(registroValido());
      await expect(e.servicio.restablecer(peticion(tokenValido))).resolves.toEqual({
        mensaje: 'Tu contraseña cambió. Ingresa con la nueva contraseña.',
      });

      expect(e.prisma.$transaction).toHaveBeenCalledTimes(1);
      const { where, data } = e.tablaUsuario.update.mock.calls[0][0] as {
        where: { id: string };
        data: {
          hashContrasena: string;
          intentosFallidos: number;
          bloqueadoHasta: Date | null;
          correoVerificado: boolean;
        };
      };
      expect(where).toEqual({ id: USUARIO_ID });
      expect(data.hashContrasena).toMatch(/^\$argon2id\$/);
      expect(await argon2.verify(data.hashContrasena, 'Nueva-clave-2026')).toBe(true);
      expect(data.intentosFallidos).toBe(0);
      expect(data.bloqueadoHasta).toBeNull();
      expect(data.correoVerificado).toBe(true);
      expect(e.sesiones.revocarTodas).toHaveBeenCalledWith(USUARIO_ID, e.tx);
    });

    it('un enlace reutilizado falla la segunda vez', async () => {
      const e = crearEntorno();
      e.tablaCodigo.findFirst.mockResolvedValueOnce(registroValido()).mockResolvedValueOnce(null);
      await e.servicio.restablecer(peticion(tokenValido));
      await esperarInvalido(e.servicio.restablecer(peticion(tokenValido)));
    });
  });
});
