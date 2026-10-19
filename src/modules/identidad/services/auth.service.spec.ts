import { Logger } from '@nestjs/common';
import { hash, verify } from 'argon2';
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
import type { RecuperacionService } from './recuperacion.service.js';
import type { SesionService } from './sesion.service.js';

vi.mock('argon2', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('argon2')>();
  return { ...real, verify: vi.fn(real.verify) };
});

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
      update: vi.fn().mockResolvedValue({}),
    },
    usuarioRol: { create: vi.fn().mockResolvedValue({}) },
    solicitante: { create: vi.fn().mockResolvedValue({}) },
    consentimientoDatos: { create: vi.fn().mockResolvedValue({}) },
    bitacora: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    usuario: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn().mockResolvedValue({}) },
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
  const recuperacion = {
    solicitar: vi.fn().mockResolvedValue({ mensaje: 'solicitado' }),
    restablecer: vi.fn().mockResolvedValue({ mensaje: 'restablecido' }),
  };
  const sesiones = {
    iniciar: vi.fn().mockResolvedValue({ accessToken: 'jwt', refreshToken: 'r' }),
    rotar: vi.fn().mockResolvedValue({ accessToken: 'jwt2', refreshToken: 'r2' }),
    cerrar: vi.fn().mockResolvedValue(undefined),
    datosUsuario: vi.fn().mockResolvedValue({ id: usuarioSesion.id }),
  };
  const servicio = new AuthService(
    prisma as unknown as PrismaService,
    parametros as unknown as ParametroService,
    codigos as unknown as CodigoVerificacionService,
    recuperacion as unknown as RecuperacionService,
    sesiones as unknown as SesionService,
  );
  return { servicio, prisma, parametros, codigos, recuperacion, sesiones, tx };
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

describe('AuthService (recuperación de contraseña)', () => {
  it('recuperar delega en RecuperacionService.solicitar', async () => {
    const e = crearEscenario();
    const datos = { correo: 'ana@ejemplo.com' } as RecuperarDto;
    await expect(e.servicio.recuperar(datos)).resolves.toEqual({ mensaje: 'solicitado' });
    expect(e.recuperacion.solicitar).toHaveBeenCalledWith(datos);
  });

  it('restablecer delega en RecuperacionService.restablecer', async () => {
    const e = crearEscenario();
    const datos = { token: 'a.b', contrasenaNueva: 'Nueva-clave-2026' } as RestablecerDto;
    await expect(e.servicio.restablecer(datos)).resolves.toEqual({ mensaje: 'restablecido' });
    expect(e.recuperacion.restablecer).toHaveBeenCalledWith(datos);
  });
});

describe('AuthService.ingresar', () => {
  const CONTEXTO_INGRESO = { ...CONTEXTO, correlacionId: 'corr-1' };
  const datos = { correo: 'ana@ejemplo.com', contrasena: CONTRASENA } as IngresarDto;
  let hashContrasena = '';
  let e: ReturnType<typeof crearEscenario>;

  const usuarioBd = (cambios: Record<string, unknown> = {}) => ({
    id: ID_USUARIO,
    hashContrasena,
    activo: true,
    bloqueadoHasta: null,
    ...cambios,
  });

  beforeEach(async () => {
    if (!hashContrasena) hashContrasena = await hash(CONTRASENA);
    e = crearEscenario();
    await e.servicio.onModuleInit();
    vi.mocked(verify).mockClear();
    e.parametros.obtenerNumero.mockImplementation((clave: string) =>
      Promise.resolve(clave === 'max_intentos_ingreso' ? 5 : 15),
    );
  });

  it.each([
    ['inexistente', null],
    ['inactivo', { activo: false }],
  ])('un usuario %s da 401 y ejecuta el verify de relleno', async (_caso, cambios) => {
    e.prisma.usuario.findUnique.mockResolvedValue(cambios === null ? null : usuarioBd(cambios));
    const error = await rechazo(e.servicio.ingresar(datos, CONTEXTO_INGRESO));

    expect(error).toMatchObject({ codigo: 'CREDENCIALES_INVALIDAS', status: 401 });
    expect(error).toHaveProperty('message', 'El correo o la contraseña no son correctos.');
    expect(verify).toHaveBeenCalledTimes(1);
    expect(vi.mocked(verify).mock.calls[0]?.[0]).not.toBe(hashContrasena);
    expect(e.prisma.usuario.update).not.toHaveBeenCalled();
  });

  it('una cuenta bloqueada da 429 con la hora de Bogotá y no compara la contraseña', async () => {
    const hasta = new Date('2026-10-15T19:45:00.000Z');
    e.prisma.usuario.findUnique.mockResolvedValue(usuarioBd({ bloqueadoHasta: hasta }));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T19:00:00.000Z'));
    try {
      const error = await rechazo(e.servicio.ingresar(datos, CONTEXTO_INGRESO));
      expect(error).toMatchObject({
        codigo: 'CUENTA_BLOQUEADA',
        status: 429,
        detalles: { bloqueadaHasta: hasta.toISOString() },
      });
      expect(error).toHaveProperty(
        'message',
        'Tu cuenta está bloqueada por seguridad. Intenta de nuevo a las 14:45.',
      );
    } finally {
      vi.useRealTimers();
    }
    expect(verify).not.toHaveBeenCalled();
    expect(e.prisma.usuario.update).not.toHaveBeenCalled();
  });

  it('una contraseña incorrecta incrementa de forma atómica y da 401', async () => {
    e.prisma.usuario.findUnique.mockResolvedValue(usuarioBd());
    e.prisma.usuario.update.mockResolvedValue({ intentosFallidos: 2 });
    const error = await rechazo(
      e.servicio.ingresar({ ...datos, contrasena: 'incorrecta-123' }, CONTEXTO_INGRESO),
    );

    expect(error).toMatchObject({ codigo: 'CREDENCIALES_INVALIDAS', status: 401 });
    expect(e.prisma.usuario.update).toHaveBeenCalledWith({
      where: { id: ID_USUARIO },
      data: { intentosFallidos: { increment: 1 } },
      select: { intentosFallidos: true },
    });
    expect(e.prisma.$transaction).not.toHaveBeenCalled();
    expect(e.sesiones.iniciar).not.toHaveBeenCalled();
  });

  it('el intento que llega al máximo bloquea, escribe bitácora en una transacción y da 429', async () => {
    e.prisma.usuario.findUnique.mockResolvedValue(usuarioBd());
    e.prisma.usuario.update.mockResolvedValue({ intentosFallidos: 5 });
    const antes = Date.now();
    const error = await rechazo(
      e.servicio.ingresar({ ...datos, contrasena: 'incorrecta-123' }, CONTEXTO_INGRESO),
    );

    expect(error).toMatchObject({ codigo: 'CUENTA_BLOQUEADA', status: 429 });
    expect(e.prisma.$transaction).toHaveBeenCalledOnce();
    const { data } = e.tx.usuario.update.mock.calls[0]![0] as {
      data: { bloqueadoHasta: Date; intentosFallidos: number };
    };
    expect(data.intentosFallidos).toBe(0);
    expect(data.bloqueadoHasta.getTime()).toBeGreaterThanOrEqual(antes + 15 * 60_000);
    expect(e.tx.bitacora.create).toHaveBeenCalledWith({
      data: {
        usuarioId: ID_USUARIO,
        accion: 'CUENTA_BLOQUEADA',
        entidad: 'Usuario',
        entidadId: ID_USUARIO,
        ip: CONTEXTO.ip,
        userAgent: CONTEXTO.userAgent,
        correlacionId: 'corr-1',
        datosDespues: { bloqueadoHasta: data.bloqueadoHasta.toISOString() },
      },
    });
    expect(error).toMatchObject({ detalles: { bloqueadaHasta: data.bloqueadoHasta.toISOString() } });
  });

  it('una contraseña correcta reinicia contadores, registra el ingreso e inicia la sesión', async () => {
    e.prisma.usuario.findUnique.mockResolvedValue(usuarioBd());
    const resultado = await e.servicio.ingresar(datos, CONTEXTO_INGRESO);

    expect(e.prisma.usuario.update).toHaveBeenCalledWith({
      where: { id: ID_USUARIO },
      data: { intentosFallidos: 0, bloqueadoHasta: null, ultimoIngresoEn: expect.any(Date) },
    });
    expect(e.sesiones.iniciar).toHaveBeenCalledWith(ID_USUARIO, CONTEXTO_INGRESO);
    expect(resultado).toMatchObject({ accessToken: 'jwt' });
  });

  it('un correo sin verificar sí puede ingresar y un bloqueo vencido no estorba', async () => {
    e.prisma.usuario.findUnique.mockResolvedValue(
      usuarioBd({ correoVerificado: false, bloqueadoHasta: new Date(Date.now() - 1000) }),
    );
    await expect(e.servicio.ingresar(datos, CONTEXTO_INGRESO)).resolves.toMatchObject({ accessToken: 'jwt' });
    expect(e.sesiones.iniciar).toHaveBeenCalledOnce();
  });
});

describe('AuthService (sesión)', () => {
  it('refrescar sin token da 401 SESION_INVALIDA', async () => {
    const e = crearEscenario();
    const error = await rechazo(e.servicio.refrescar(null, CONTEXTO));
    expect(error).toBeInstanceOf(ErrorDominio);
    expect(error).toMatchObject({ codigo: 'SESION_INVALIDA', status: 401 });
    expect(e.sesiones.rotar).not.toHaveBeenCalled();
  });

  it('refrescar con token delega en rotar', async () => {
    const e = crearEscenario();
    await expect(e.servicio.refrescar('abc', CONTEXTO)).resolves.toMatchObject({ accessToken: 'jwt2' });
    expect(e.sesiones.rotar).toHaveBeenCalledWith('abc', CONTEXTO);
  });

  it('salir delega en cerrar, también con null', async () => {
    const e = crearEscenario();
    await e.servicio.salir('abc');
    await e.servicio.salir(null);
    expect(e.sesiones.cerrar).toHaveBeenNthCalledWith(1, 'abc');
    expect(e.sesiones.cerrar).toHaveBeenNthCalledWith(2, null);
  });

  it('yo delega en datosUsuario', async () => {
    const e = crearEscenario();
    await expect(e.servicio.yo(usuarioSesion)).resolves.toEqual({ id: usuarioSesion.id });
    expect(e.sesiones.datosUsuario).toHaveBeenCalledWith(usuarioSesion.id);
  });
});
