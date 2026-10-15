import { Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import type { ParametroService } from '../../../shared/parametros/parametro.service.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { CorreoPort } from '../../notificaciones/correo/correo.port.js';
import { CodigoVerificacionService } from './codigo-verificacion.service.js';

const { randomIntMock } = vi.hoisted(() => ({ randomIntMock: vi.fn() }));
vi.mock('node:crypto', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('node:crypto')>()),
  randomInt: randomIntMock,
}));

const AHORA = new Date('2026-10-14T15:00:00.000Z');
const USUARIO_ID = '3f2b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';
const CORREO = 'ana@ejemplo.com';
const PARAMETROS: Record<string, number> = {
  minutos_vigencia_codigo: 15,
  max_intentos_codigo: 5,
  segundos_espera_reenvio_codigo: 60,
};

function crearEntorno() {
  const tablaCodigo = {
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    create: vi.fn().mockResolvedValue({}),
    findFirst: vi.fn(),
  };
  const tablaUsuario = { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) };
  const tx = { codigoVerificacion: tablaCodigo, usuario: tablaUsuario };
  const prisma = {
    usuario: tablaUsuario,
    codigoVerificacion: tablaCodigo,
    $transaction: vi.fn(async (fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const parametros = {
    obtenerNumero: vi.fn((clave: string) => Promise.resolve(PARAMETROS[clave])),
  };
  const correo = { enviar: vi.fn().mockResolvedValue(undefined) };
  const servicio = new CodigoVerificacionService(
    prisma as unknown as PrismaService,
    parametros as unknown as ParametroService,
    correo as unknown as CorreoPort,
  );
  return { servicio, prisma, correo, tablaCodigo, tablaUsuario };
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

describe('CodigoVerificacionService', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AHORA);
    randomIntMock.mockReturnValue(42);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('emitirVerificacionCorreo', () => {
    it('genera 6 dígitos con ceros a la izquierda y guarda solo el hash argon2id', async () => {
      const { servicio, tablaCodigo, correo } = crearEntorno();
      await servicio.emitirVerificacionCorreo({ id: USUARIO_ID, correo: CORREO, nombres: 'Ana' });

      const { data } = tablaCodigo.create.mock.calls[0][0] as {
        data: { usuarioId: string; proposito: string; hashCodigo: string; expiraEn: Date };
      };
      expect(data.usuarioId).toBe(USUARIO_ID);
      expect(data.proposito).toBe('VERIFICAR_CORREO');
      expect(data.hashCodigo).toMatch(/^\$argon2id\$/);
      expect(await argon2.verify(data.hashCodigo, '000042')).toBe(true);
      expect(JSON.stringify(tablaCodigo.create.mock.calls)).not.toContain('"000042"');
      expect(data.expiraEn).toEqual(new Date(AHORA.getTime() + 15 * 60_000));
      expect(correo.enviar).toHaveBeenCalledTimes(1);
    });

    it('invalida los códigos anteriores sin usar en la misma transacción', async () => {
      const { servicio, prisma, tablaCodigo } = crearEntorno();
      const orden: string[] = [];
      tablaCodigo.updateMany.mockImplementation(() => {
        orden.push('invalidar');
        return Promise.resolve({ count: 2 });
      });
      tablaCodigo.create.mockImplementation(() => {
        orden.push('crear');
        return Promise.resolve({});
      });
      await servicio.emitirVerificacionCorreo({ id: USUARIO_ID, correo: CORREO, nombres: 'Ana' });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(orden).toEqual(['invalidar', 'crear']);
      expect(tablaCodigo.updateMany).toHaveBeenCalledWith({
        where: { usuarioId: USUARIO_ID, proposito: 'VERIFICAR_CORREO', usadoEn: null, expiraEn: { gt: AHORA } },
        data: { expiraEn: AHORA },
      });
    });

    it('envía el correo a la dirección correcta con el código y sin registrarlo en logs', async () => {
      const espias = (['log', 'debug', 'warn', 'error', 'verbose'] as const).map((nivel) =>
        vi.spyOn(Logger.prototype, nivel).mockImplementation(() => undefined),
      );
      const { servicio, correo } = crearEntorno();
      await servicio.emitirVerificacionCorreo({ id: USUARIO_ID, correo: CORREO, nombres: 'Ana' });

      const mensaje = correo.enviar.mock.calls[0][0] as { para: string; asunto: string; texto: string };
      expect(mensaje.para).toBe(CORREO);
      expect(mensaje.texto).toContain('000042');
      expect(mensaje.asunto).toContain('000042');
      for (const espia of espias) {
        expect(JSON.stringify(espia.mock.calls)).not.toContain('000042');
      }
    });
  });

  describe('verificarCorreo', () => {
    const datos = { correo: CORREO, codigo: '123456' };
    let hash: string;

    beforeEach(async () => {
      hash = await argon2.hash('123456', { type: argon2.argon2id });
    });

    function conCodigo(intentos: number) {
      const entorno = crearEntorno();
      entorno.tablaUsuario.findUnique.mockResolvedValue({ id: USUARIO_ID, correoVerificado: false });
      entorno.tablaCodigo.findFirst.mockResolvedValue({ id: 'c1', hashCodigo: hash, intentos });
      return entorno;
    }

    it('usuario inexistente: CODIGO_INVALIDO 422 sin revelar la cuenta', async () => {
      const { servicio, tablaUsuario } = crearEntorno();
      tablaUsuario.findUnique.mockResolvedValue(null);
      const error = await capturar(servicio.verificarCorreo(datos));
      expect(error).toMatchObject({
        codigo: 'CODIGO_INVALIDO',
        status: 422,
        message: 'El código no es válido. Revisa el correo o solicita uno nuevo.',
      });
    });

    it('usuario ya verificado: 200 con mensaje informativo', async () => {
      const { servicio, tablaUsuario, tablaCodigo } = crearEntorno();
      tablaUsuario.findUnique.mockResolvedValue({ id: USUARIO_ID, correoVerificado: true });
      await expect(servicio.verificarCorreo(datos)).resolves.toEqual({
        mensaje: 'Tu correo ya está verificado.',
      });
      expect(tablaCodigo.findFirst).not.toHaveBeenCalled();
    });

    it('sin código vigente: CODIGO_VENCIDO 422', async () => {
      const { servicio, tablaUsuario, tablaCodigo } = crearEntorno();
      tablaUsuario.findUnique.mockResolvedValue({ id: USUARIO_ID, correoVerificado: false });
      tablaCodigo.findFirst.mockResolvedValue(null);
      const error = await capturar(servicio.verificarCorreo(datos));
      expect(error).toMatchObject({
        codigo: 'CODIGO_VENCIDO',
        status: 422,
        message: 'El código venció. Solicita uno nuevo.',
      });
      expect(tablaCodigo.findFirst).toHaveBeenCalledWith({
        where: { usuarioId: USUARIO_ID, proposito: 'VERIFICAR_CORREO', usadoEn: null, expiraEn: { gt: AHORA } },
        orderBy: { creadoEn: 'desc' },
      });
    });

    it('intentos agotados: CODIGO_AGOTADO 422 sin comparar', async () => {
      const { servicio, tablaCodigo } = conCodigo(5);
      const error = await capturar(servicio.verificarCorreo(datos));
      expect(error).toMatchObject({
        codigo: 'CODIGO_AGOTADO',
        status: 422,
        message: 'Superaste los intentos permitidos. Solicita un código nuevo.',
      });
      expect(tablaCodigo.updateMany).not.toHaveBeenCalled();
    });

    it('código incorrecto: incrementa con condición intentos < max e informa los restantes', async () => {
      const { servicio, tablaCodigo } = conCodigo(1);
      const error = await capturar(servicio.verificarCorreo({ ...datos, codigo: '000000' }));
      expect(error).toMatchObject({
        codigo: 'CODIGO_INVALIDO',
        status: 422,
        message: 'El código no es correcto. Te quedan 3 intentos.',
        detalles: { intentosRestantes: 3 },
      });
      expect(tablaCodigo.updateMany).toHaveBeenCalledWith({
        where: { id: 'c1', intentos: { lt: 5 } },
        data: { intentos: { increment: 1 } },
      });
    });

    it('conjuga en singular cuando queda un intento', async () => {
      const { servicio } = conCodigo(3);
      const error = await capturar(servicio.verificarCorreo({ ...datos, codigo: '000000' }));
      expect(error).toMatchObject({
        codigo: 'CODIGO_INVALIDO',
        message: 'El código no es correcto. Te queda 1 intento.',
        detalles: { intentosRestantes: 1 },
      });
    });

    it('el último intento fallido responde CODIGO_AGOTADO', async () => {
      const { servicio } = conCodigo(4);
      const error = await capturar(servicio.verificarCorreo({ ...datos, codigo: '000000' }));
      expect(error).toMatchObject({ codigo: 'CODIGO_AGOTADO', status: 422 });
    });

    it('incremento sin filas (otra petición agotó el cupo): CODIGO_AGOTADO', async () => {
      const { servicio, tablaCodigo } = conCodigo(1);
      tablaCodigo.updateMany.mockResolvedValue({ count: 0 });
      const error = await capturar(servicio.verificarCorreo({ ...datos, codigo: '000000' }));
      expect(error.codigo).toBe('CODIGO_AGOTADO');
    });

    it('código correcto: marca usadoEn y correoVerificado en una transacción', async () => {
      const { servicio, prisma, tablaCodigo, tablaUsuario } = conCodigo(0);
      await expect(servicio.verificarCorreo(datos)).resolves.toEqual({
        mensaje: 'Tu correo quedó verificado. Ya puedes ingresar.',
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tablaCodigo.updateMany).toHaveBeenCalledWith({
        where: { id: 'c1', usadoEn: null },
        data: { usadoEn: AHORA },
      });
      expect(tablaUsuario.update).toHaveBeenCalledWith({
        where: { id: USUARIO_ID },
        data: { correoVerificado: true },
      });
    });

    it('carrera: si otro proceso ya usó el código responde CODIGO_VENCIDO sin verificar', async () => {
      const { servicio, tablaCodigo, tablaUsuario } = conCodigo(0);
      tablaCodigo.updateMany.mockResolvedValue({ count: 0 });
      const error = await capturar(servicio.verificarCorreo(datos));
      expect(error).toMatchObject({ codigo: 'CODIGO_VENCIDO', status: 422 });
      expect(tablaUsuario.update).not.toHaveBeenCalled();
    });
  });

  describe('reenviarVerificacionCorreo', () => {
    const datos = { correo: CORREO };
    const generico = { mensaje: 'Si la cuenta existe y no está verificada, te enviamos un código nuevo.' };

    function conUsuario(creadoEn: Date | null, solicitante: { nombres: string } | null = { nombres: 'Ana' }) {
      const entorno = crearEntorno();
      entorno.tablaUsuario.findUnique.mockResolvedValue({
        id: USUARIO_ID,
        correo: CORREO,
        correoVerificado: false,
        solicitante,
      });
      entorno.tablaCodigo.findFirst.mockResolvedValue(creadoEn ? { creadoEn } : null);
      return entorno;
    }

    it('usuario inexistente: mensaje genérico sin enviar', async () => {
      const { servicio, tablaUsuario, correo } = crearEntorno();
      tablaUsuario.findUnique.mockResolvedValue(null);
      await expect(servicio.reenviarVerificacionCorreo(datos)).resolves.toEqual(generico);
      expect(correo.enviar).not.toHaveBeenCalled();
    });

    it('usuario ya verificado: mensaje genérico sin enviar', async () => {
      const { servicio, tablaUsuario, correo } = crearEntorno();
      tablaUsuario.findUnique.mockResolvedValue({ id: USUARIO_ID, correo: CORREO, correoVerificado: true });
      await expect(servicio.reenviarVerificacionCorreo(datos)).resolves.toEqual(generico);
      expect(correo.enviar).not.toHaveBeenCalled();
    });

    it('antes de 60 s: CODIGO_RECIENTE 429', async () => {
      const { servicio, correo } = conUsuario(new Date(AHORA.getTime() - 30_000));
      const error = await capturar(servicio.reenviarVerificacionCorreo(datos));
      expect(error).toMatchObject({
        codigo: 'CODIGO_RECIENTE',
        status: 429,
        message: 'Espera un minuto antes de pedir otro código.',
      });
      expect(correo.enviar).not.toHaveBeenCalled();
    });

    it('después de 60 s: emite un código nuevo y responde el genérico', async () => {
      const { servicio, correo, tablaCodigo } = conUsuario(new Date(AHORA.getTime() - 61_000));
      await expect(servicio.reenviarVerificacionCorreo(datos)).resolves.toEqual(generico);
      expect(tablaCodigo.create).toHaveBeenCalledTimes(1);
      expect(correo.enviar).toHaveBeenCalledWith(expect.objectContaining({ para: CORREO }));
      expect(JSON.stringify(correo.enviar.mock.calls[0][0])).toContain('Ana');
    });

    it('sin perfil de solicitante usa el correo como nombre', async () => {
      const { servicio, correo } = conUsuario(null, null);
      await servicio.reenviarVerificacionCorreo(datos);
      const mensaje = correo.enviar.mock.calls[0][0] as { texto: string };
      expect(mensaje.texto).toContain(`Hola, ${CORREO}:`);
    });
  });
});
