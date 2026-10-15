import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TipoDocumentoIdentidad, TipoSolicitante } from '../../../generated/prisma/enums.js';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import type { ParametroService } from '../../../shared/parametros/parametro.service.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { IngresarDto } from '../dto/ingresar.dto.js';
import type { RecuperarDto } from '../dto/recuperar.dto.js';
import type { ReenviarCodigoDto } from '../dto/reenviar-codigo.dto.js';
import type { RegistroDto } from '../dto/registro.dto.js';
import type { RestablecerDto } from '../dto/restablecer.dto.js';
import type { VerificarCorreoDto } from '../dto/verificar-correo.dto.js';
import { AuthService } from './auth.service.js';
import type { CodigoVerificacionService } from './codigo-verificacion.service.js';

const usuarioSesion: UsuarioAutenticado = {
  id: '3f2b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b',
  correo: 'ana@ejemplo.com',
  roles: [],
  dependencias: [],
  correoVerificado: true,
  esInstitucional: false,
};

const ID_USUARIO = '11111111-2222-4333-8444-555555555555';
const ID_DEPENDENCIA = '3f2b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';
const CONTRASENA = 'Clave-segura-2026';
const CONTEXTO = { ip: '10.0.0.7', userAgent: 'Mozilla/5.0 (pruebas)' };

const registroBase = (cambios: Partial<RegistroDto> = {}): RegistroDto =>
  ({
    correo: 'ana@ejemplo.com',
    contrasena: CONTRASENA,
    tipo: TipoSolicitante.PERSONA_NATURAL,
    nombres: 'Ana',
    tipoDocumento: TipoDocumentoIdentidad.CC,
    numeroDocumento: '1020304050',
    telefono: '3001234567',
    aceptaPoliticaDatos: true,
    versionPolitica: '2026-01',
    ...cambios,
  }) as RegistroDto;

function crearEscenario() {
  const tx = {
    usuario: {
      create: vi.fn((args: { data: { correo: string; hashContrasena: string } }) =>
        Promise.resolve({ id: ID_USUARIO, correo: args.data.correo }),
      ),
    },
    usuarioRol: { create: vi.fn().mockResolvedValue({}) },
    solicitante: { create: vi.fn().mockResolvedValue({}) },
    consentimientoDatos: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    usuario: { findUnique: vi.fn().mockResolvedValue(null) },
    solicitante: { findUnique: vi.fn().mockResolvedValue(null) },
    dependencia: { findFirst: vi.fn().mockResolvedValue({ id: ID_DEPENDENCIA }) },
    $transaction: vi.fn((callback: (t: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const parametros = {
    obtenerTexto: vi.fn().mockResolvedValue('2026-01'),
    obtenerListaTexto: vi.fn().mockResolvedValue(['itp.edu.co', 'uniputumayo.edu.co']),
    obtenerNumero: vi.fn(),
  };
  const codigos = {
    emitirVerificacionCorreo: vi.fn().mockResolvedValue(undefined),
    verificarCorreo: vi.fn().mockResolvedValue({ mensaje: 'verificado' }),
    reenviarVerificacionCorreo: vi.fn().mockResolvedValue({ mensaje: 'reenviado' }),
  };
  const servicio = new AuthService(
    prisma as unknown as PrismaService,
    parametros as unknown as ParametroService,
    codigos as unknown as CodigoVerificacionService,
  );
  return { servicio, prisma, parametros, codigos, tx };
}

const rechazo = async (promesa: Promise<unknown>): Promise<unknown> => promesa.catch((e: unknown) => e);

describe('AuthService.registrar', () => {
  let e: ReturnType<typeof crearEscenario>;

  beforeEach(() => {
    e = crearEscenario();
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  describe('política de datos', () => {
    it('rechaza con 422 si la versión no coincide con la vigente', async () => {
      const error = await rechazo(e.servicio.registrar(registroBase({ versionPolitica: '2025-01' }), CONTEXTO));
      expect(error).toBeInstanceOf(ErrorDominio);
      expect(error).toMatchObject({
        codigo: 'POLITICA_DESACTUALIZADA',
        status: 422,
        message: 'La política de tratamiento de datos cambió. Recarga la página y acéptala de nuevo.',
      });
      expect(e.parametros.obtenerTexto).toHaveBeenCalledWith('version_politica_datos');
      expect(e.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('acepta la versión vigente', async () => {
      await expect(e.servicio.registrar(registroBase(), CONTEXTO)).resolves.toMatchObject({ id: ID_USUARIO });
    });
  });

  describe('correo institucional', () => {
    it.each([
      ['dominio exacto', 'ana@itp.edu.co', true],
      ['subdominio', 'ana@estudiantes.itp.edu.co', true],
      ['con mayúsculas', 'Ana@ITP.Edu.CO', true],
      ['subdominio con mayúsculas', 'ana@Estudiantes.UniPutumayo.edu.co', true],
      ['dominio externo', 'ana@ejemplo.com', false],
      ['sufijo sin punto', 'ana@noitp.edu.co', false],
      ['dominio contenido', 'ana@itp.edu.co.falso.com', false],
    ])('%s', async (_nombre, correo, esperado) => {
      const respuesta = await e.servicio.registrar(registroBase({ correo }), CONTEXTO);
      expect(respuesta.esInstitucional).toBe(esperado);
      expect(e.tx.usuario.create.mock.calls[0]?.[0].data).toMatchObject({ esInstitucional: esperado });
    });
  });

  describe('tipo de solicitante', () => {
    it('institucional pasa a INTERNO ignorando el tipo enviado', async () => {
      await e.servicio.registrar(
        registroBase({ correo: 'ana@itp.edu.co', tipo: TipoSolicitante.EMPRESA }),
        CONTEXTO,
      );
      expect(e.tx.solicitante.create.mock.calls[0]?.[0].data.tipo).toBe(TipoSolicitante.INTERNO);
    });

    it('no institucional que envía INTERNO se rechaza con 422', async () => {
      const error = await rechazo(
        e.servicio.registrar(registroBase({ tipo: TipoSolicitante.INTERNO }), CONTEXTO),
      );
      expect(error).toMatchObject({
        codigo: 'TIPO_SOLICITANTE_INVALIDO',
        status: 422,
        message: 'Solo las cuentas con correo institucional pueden registrarse como internas.',
      });
      expect(e.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('no institucional conserva el tipo enviado', async () => {
      await e.servicio.registrar(registroBase({ tipo: TipoSolicitante.EMPRESA, razonSocial: 'ACME' }), CONTEXTO);
      expect(e.tx.solicitante.create.mock.calls[0]?.[0].data.tipo).toBe(TipoSolicitante.EMPRESA);
    });
  });

  describe('dependencia', () => {
    const interno = (cambios: Partial<RegistroDto> = {}) =>
      registroBase({ correo: 'ana@itp.edu.co', tipo: TipoSolicitante.INTERNO, ...cambios });

    it('interno con dependencia activa la guarda', async () => {
      await e.servicio.registrar(interno({ dependenciaId: ID_DEPENDENCIA }), CONTEXTO);
      expect(e.prisma.dependencia.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ID_DEPENDENCIA, activa: true } }),
      );
      expect(e.tx.solicitante.create.mock.calls[0]?.[0].data.dependenciaId).toBe(ID_DEPENDENCIA);
    });

    it('interno con dependencia inexistente responde 404', async () => {
      e.prisma.dependencia.findFirst.mockResolvedValue(null);
      const error = await rechazo(e.servicio.registrar(interno({ dependenciaId: ID_DEPENDENCIA }), CONTEXTO));
      expect(error).toMatchObject({
        codigo: 'DEPENDENCIA_NO_ENCONTRADA',
        status: 404,
        message: 'La dependencia seleccionada no existe.',
      });
      expect(e.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('interno sin dependencia guarda null sin consultar', async () => {
      await e.servicio.registrar(interno(), CONTEXTO);
      expect(e.prisma.dependencia.findFirst).not.toHaveBeenCalled();
      expect(e.tx.solicitante.create.mock.calls[0]?.[0].data.dependenciaId).toBeNull();
    });

    it('externo descarta la dependencia enviada', async () => {
      await e.servicio.registrar(registroBase({ dependenciaId: ID_DEPENDENCIA }), CONTEXTO);
      expect(e.prisma.dependencia.findFirst).not.toHaveBeenCalled();
      expect(e.tx.solicitante.create.mock.calls[0]?.[0].data.dependenciaId).toBeNull();
    });
  });

  describe('duplicados', () => {
    it('correo ya registrado responde 409', async () => {
      e.prisma.usuario.findUnique.mockResolvedValue({ id: 'otro' });
      const error = await rechazo(e.servicio.registrar(registroBase(), CONTEXTO));
      expect(error).toMatchObject({
        codigo: 'CORREO_REGISTRADO',
        status: 409,
        message: 'Ya existe una cuenta con este correo. Ingresa o recupera tu contraseña.',
      });
      expect(e.prisma.usuario.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { correo: 'ana@ejemplo.com' } }),
      );
      expect(e.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('documento ya registrado responde 409', async () => {
      e.prisma.solicitante.findUnique.mockResolvedValue({ id: 'otro' });
      const error = await rechazo(e.servicio.registrar(registroBase(), CONTEXTO));
      expect(error).toMatchObject({
        codigo: 'DOCUMENTO_REGISTRADO',
        status: 409,
        message: 'Ya existe una cuenta con este documento de identidad.',
      });
      expect(e.prisma.solicitante.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tipoDocumento_numeroDocumento: { tipoDocumento: 'CC', numeroDocumento: '1020304050' },
          },
        }),
      );
      expect(e.prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('contraseña', () => {
    it('se guarda con Argon2id y nunca en claro', async () => {
      await e.servicio.registrar(registroBase(), CONTEXTO);
      const guardado = e.tx.usuario.create.mock.calls[0]?.[0].data;
      expect(guardado.hashContrasena.startsWith('$argon2id$')).toBe(true);
      expect(guardado.hashContrasena).not.toContain(CONTRASENA);
      expect(JSON.stringify(e.tx.solicitante.create.mock.calls)).not.toContain(CONTRASENA);
      expect(JSON.stringify(e.tx.consentimientoDatos.create.mock.calls)).not.toContain(CONTRASENA);
    });
  });

  describe('transacción', () => {
    it('crea las cuatro filas dentro del tx con los datos correctos', async () => {
      await e.servicio.registrar(
        registroBase({
          apellidos: 'Pérez',
          representanteLegal: 'Carlos Ruiz',
          direccion: 'Calle 10 # 5-20',
          municipio: 'Mocoa',
        }),
        CONTEXTO,
      );
      expect(e.prisma.$transaction).toHaveBeenCalledTimes(1);

      expect(e.tx.usuario.create.mock.calls[0]?.[0].data).toMatchObject({
        correo: 'ana@ejemplo.com',
        esInstitucional: false,
        correoVerificado: false,
      });
      expect(e.tx.usuarioRol.create).toHaveBeenCalledWith({
        data: { usuarioId: ID_USUARIO, rol: 'SOLICITANTE', dependenciaId: null },
      });
      expect(e.tx.solicitante.create).toHaveBeenCalledWith({
        data: {
          usuarioId: ID_USUARIO,
          tipo: TipoSolicitante.PERSONA_NATURAL,
          nombres: 'Ana',
          apellidos: 'Pérez',
          razonSocial: null,
          tipoDocumento: 'CC',
          numeroDocumento: '1020304050',
          representanteLegal: 'Carlos Ruiz',
          telefono: '3001234567',
          direccion: 'Calle 10 # 5-20',
          municipio: 'Mocoa',
          dependenciaId: null,
        },
      });
      expect(e.tx.consentimientoDatos.create).toHaveBeenCalledWith({
        data: {
          usuarioId: ID_USUARIO,
          versionPolitica: '2026-01',
          ip: '10.0.0.7',
          userAgent: 'Mozilla/5.0 (pruebas)',
        },
      });
    });

    it('deja en null los campos opcionales ausentes y el user-agent nulo', async () => {
      await e.servicio.registrar(registroBase(), { ip: '::1', userAgent: null });
      expect(e.tx.solicitante.create.mock.calls[0]?.[0].data).toMatchObject({
        apellidos: null,
        razonSocial: null,
        representanteLegal: null,
        direccion: null,
        municipio: null,
      });
      expect(e.tx.consentimientoDatos.create.mock.calls[0]?.[0].data).toMatchObject({
        ip: '::1',
        userAgent: null,
      });
    });
  });

  describe('envío del código', () => {
    it('se emite después de la transacción con id, correo y nombres', async () => {
      const orden: string[] = [];
      e.prisma.$transaction.mockImplementation(async (cb: (t: typeof e.tx) => Promise<unknown>) => {
        const resultado = await cb(e.tx);
        orden.push('transaccion');
        return resultado;
      });
      e.codigos.emitirVerificacionCorreo.mockImplementation(() => {
        orden.push('envio');
        return Promise.resolve();
      });
      await e.servicio.registrar(registroBase(), CONTEXTO);
      expect(orden).toEqual(['transaccion', 'envio']);
      expect(e.codigos.emitirVerificacionCorreo).toHaveBeenCalledWith({
        id: ID_USUARIO,
        correo: 'ana@ejemplo.com',
        nombres: 'Ana',
      });
    });

    it('envío exitoso: mensaje estándar', async () => {
      const respuesta = await e.servicio.registrar(registroBase(), CONTEXTO);
      expect(respuesta).toEqual({
        id: ID_USUARIO,
        correo: 'ana@ejemplo.com',
        esInstitucional: false,
        correoVerificado: false,
        mensaje: 'Te enviamos un código de verificación a tu correo.',
      });
    });

    it('envío fallido: responde igual, con mensaje alterno, y registra el error', async () => {
      e.codigos.emitirVerificacionCorreo.mockRejectedValue(
        new ErrorDominio('CORREO_NO_ENVIADO', 'No se pudo enviar el correo.', 503),
      );
      const respuesta = await e.servicio.registrar(registroBase(), CONTEXTO);
      expect(respuesta).toEqual({
        id: ID_USUARIO,
        correo: 'ana@ejemplo.com',
        esInstitucional: false,
        correoVerificado: false,
        mensaje:
          'Tu cuenta fue creada, pero no pudimos enviarte el código. Usa «Reenviar código» en unos minutos.',
      });
      expect(e.tx.usuario.create).toHaveBeenCalledTimes(1);
      expect(Logger.prototype.error).toHaveBeenCalled();
    });
  });

  describe('respuesta', () => {
    it('no incluye la contraseña ni su hash', async () => {
      const respuesta = await e.servicio.registrar(registroBase(), CONTEXTO);
      expect(Object.keys(respuesta).sort()).toEqual(
        ['correo', 'correoVerificado', 'esInstitucional', 'id', 'mensaje'].sort(),
      );
    });
  });
});

describe('AuthService delegación en CodigoVerificacionService', () => {
  it('verificarCorreo delega', async () => {
    const e = crearEscenario();
    const datos = { correo: 'ana@ejemplo.com', codigo: '482913' } as VerificarCorreoDto;
    await expect(e.servicio.verificarCorreo(datos)).resolves.toEqual({ mensaje: 'verificado' });
    expect(e.codigos.verificarCorreo).toHaveBeenCalledWith(datos);
  });

  it('reenviarCodigo delega en reenviarVerificacionCorreo', async () => {
    const e = crearEscenario();
    const datos = { correo: 'ana@ejemplo.com' } as ReenviarCodigoDto;
    await expect(e.servicio.reenviarCodigo(datos)).resolves.toEqual({ mensaje: 'reenviado' });
    expect(e.codigos.reenviarVerificacionCorreo).toHaveBeenCalledWith(datos);
  });
});

describe('AuthService (métodos sin implementar)', () => {
  const { servicio } = crearEscenario();

  const casos: [string, () => Promise<unknown>][] = [
    ['ingresar', () => servicio.ingresar({} as IngresarDto)],
    ['refrescar', () => servicio.refrescar()],
    ['salir', () => servicio.salir(usuarioSesion)],
    ['recuperar', () => servicio.recuperar({} as RecuperarDto)],
    ['restablecer', () => servicio.restablecer({} as RestablecerDto)],
    ['yo', () => servicio.yo(usuarioSesion)],
  ];

  it.each(casos)('%s rechaza con NO_IMPLEMENTADO y estado 501', async (_nombre, llamar) => {
    const error: unknown = await llamar().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ErrorDominio);
    expect(error).toMatchObject({ codigo: 'NO_IMPLEMENTADO', status: 501 });
  });
});
