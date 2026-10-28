import { describe, expect, it, vi } from 'vitest';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { SesionService } from '../../identidad/services/sesion.service.js';
import { UsuariosAdminService } from './usuarios-admin.service.js';

const CONTEXTO = { ip: '10.0.0.1', userAgent: 'vitest', correlacionId: 'corr-1' };
const USUARIO_ID = '3f2b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';
const DEPENDENCIA_ID = '8a3b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';

const admin: UsuarioAutenticado = {
  id: 'u-admin',
  correo: 'admin@itp.edu.co',
  roles: ['ADMINISTRADOR'],
  dependencias: [],
  correoVerificado: true,
  esInstitucional: true,
};

const fila = (cambios: Record<string, unknown> = {}) => ({
  id: USUARIO_ID,
  correo: 'ana@itp.edu.co',
  hashContrasena: 'no-debe-salir',
  mfaSecreto: 'no-debe-salir',
  activo: true,
  correoVerificado: true,
  esInstitucional: true,
  ultimoIngresoEn: new Date('2026-10-22T15:00:00.000Z'),
  creadoEn: new Date('2026-10-01T15:00:00.000Z'),
  roles: [{ rol: 'SOLICITANTE', dependenciaId: null }],
  solicitante: { nombres: 'Ana', apellidos: 'Pérez', razonSocial: null },
  ...cambios,
});

function crearEntorno(actual: unknown = fila()) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    usuario: { update: vi.fn().mockResolvedValue({}), count: vi.fn().mockResolvedValue(1) },
    usuarioRol: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    bitacora: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    usuario: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([fila()]),
      findUnique: vi.fn().mockResolvedValue(actual),
    },
    dependencia: { findMany: vi.fn().mockResolvedValue([{ id: DEPENDENCIA_ID }]) },
    $transaction: vi.fn((fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const sesiones = { revocarTodas: vi.fn().mockResolvedValue(undefined) };
  const servicio = new UsuariosAdminService(
    prisma as unknown as PrismaService,
    sesiones as unknown as SesionService,
  );
  return { servicio, prisma, tx, sesiones };
}

const rechazo = (promesa: Promise<unknown>): Promise<unknown> => promesa.catch((e: unknown) => e);

describe('UsuariosAdminService.listar y obtener', () => {
  it('lista con filtros y nunca expone contraseña ni secretos', async () => {
    const e = crearEntorno();
    const r = await e.servicio.listar({ rol: 'APROBADOR', activo: true, busqueda: ' ana ', pagina: 2, porPagina: 10 });

    expect(e.prisma.usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          activo: true,
          roles: { some: { rol: 'APROBADOR' } },
          correo: { contains: 'ana', mode: 'insensitive' },
        },
        skip: 10,
        take: 10,
      }),
    );
    expect(r).toMatchObject({ total: 1, pagina: 2, porPagina: 10 });
    expect(r.datos[0]).toMatchObject({ id: USUARIO_ID, nombre: 'Ana Pérez', activo: true });
    expect(JSON.stringify(r)).not.toContain('no-debe-salir');
  });

  it('usa la razón social si no hay nombres y null si no hay perfil', async () => {
    const e = crearEntorno(fila({ solicitante: { nombres: '', apellidos: null, razonSocial: 'Eventos S.A.S.' } }));
    await expect(e.servicio.obtener(USUARIO_ID)).resolves.toMatchObject({ nombre: 'Eventos S.A.S.' });

    const sinPerfil = crearEntorno(fila({ solicitante: null }));
    await expect(sinPerfil.servicio.obtener(USUARIO_ID)).resolves.toMatchObject({ nombre: null });
  });

  it('un usuario inexistente responde 404', async () => {
    const e = crearEntorno(null);
    await expect(rechazo(e.servicio.obtener(USUARIO_ID))).resolves.toMatchObject({
      codigo: 'NO_ENCONTRADO',
      status: 404,
    });
  });
});

describe('UsuariosAdminService.cambiarEstado', () => {
  it('desactivar cierra las sesiones en la transacción y escribe bitácora', async () => {
    const e = crearEntorno();
    await e.servicio.cambiarEstado(USUARIO_ID, false, admin, CONTEXTO);

    expect(e.tx.usuario.update).toHaveBeenCalledWith({ where: { id: USUARIO_ID }, data: { activo: false } });
    expect(e.sesiones.revocarTodas).toHaveBeenCalledWith(USUARIO_ID, e.tx);
    expect(e.tx.bitacora.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accion: 'USUARIO_DESACTIVADO',
        usuarioId: 'u-admin',
        entidadId: USUARIO_ID,
        datosAntes: { activo: true },
        datosDespues: { activo: false },
        correlacionId: 'corr-1',
      }),
    });
  });

  it('activar no toca las sesiones', async () => {
    const e = crearEntorno(fila({ activo: false }));
    await e.servicio.cambiarEstado(USUARIO_ID, true, admin, CONTEXTO);
    expect(e.sesiones.revocarTodas).not.toHaveBeenCalled();
    expect(e.tx.bitacora.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ accion: 'USUARIO_ACTIVADO' }),
    });
  });

  it('un administrador no puede desactivarse a sí mismo', async () => {
    const e = crearEntorno(fila({ id: 'u-admin' }));
    const error = await rechazo(e.servicio.cambiarEstado('u-admin', false, admin, CONTEXTO));
    expect(error).toMatchObject({ codigo: 'AUTODESACTIVACION', status: 409 });
    expect(e.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('no se desactiva al último administrador activo', async () => {
    const e = crearEntorno(fila({ roles: [{ rol: 'ADMINISTRADOR', dependenciaId: null }] }));
    e.tx.usuario.count.mockResolvedValue(0);
    const error = await rechazo(e.servicio.cambiarEstado(USUARIO_ID, false, admin, CONTEXTO));
    expect(error).toMatchObject({ codigo: 'ULTIMO_ADMINISTRADOR', status: 409 });
    expect(e.tx.usuario.update).not.toHaveBeenCalled();
  });

  it('serializa con un candado consultivo y cuenta a los demás administradores dentro de la transacción', async () => {
    const orden: string[] = [];
    const e = crearEntorno(fila({ roles: [{ rol: 'ADMINISTRADOR', dependenciaId: null }] }));
    e.tx.$executeRaw.mockImplementation(() => {
      orden.push('candado');
      return Promise.resolve(1);
    });
    e.tx.usuario.count.mockImplementation(() => {
      orden.push('contar');
      return Promise.resolve(1);
    });
    e.tx.usuario.update.mockImplementation(() => {
      orden.push('actualizar');
      return Promise.resolve({});
    });
    await e.servicio.cambiarEstado(USUARIO_ID, false, admin, CONTEXTO);

    expect(orden).toEqual(['candado', 'contar', 'actualizar']);
    expect(e.prisma.usuario.count).not.toHaveBeenCalled();
  });

  it('se desactiva a un administrador si queda otro', async () => {
    const e = crearEntorno(fila({ roles: [{ rol: 'ADMINISTRADOR', dependenciaId: null }] }));
    await expect(e.servicio.cambiarEstado(USUARIO_ID, false, admin, CONTEXTO)).resolves.toBeDefined();
    expect(e.tx.usuario.count).toHaveBeenCalledWith({
      where: { id: { not: USUARIO_ID }, activo: true, roles: { some: { rol: 'ADMINISTRADOR' } } },
    });
  });

  it('un usuario inexistente responde 404', async () => {
    const e = crearEntorno(null);
    const error = await rechazo(e.servicio.cambiarEstado(USUARIO_ID, false, admin, CONTEXTO));
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
  });
});

describe('UsuariosAdminService.reemplazarRoles', () => {
  it('reemplaza las filas, cierra sesiones y deja los roles anteriores en la bitácora', async () => {
    const e = crearEntorno();
    await e.servicio.reemplazarRoles(
      USUARIO_ID,
      {
        roles: [
          { rol: 'SOLICITANTE' },
          { rol: 'APROBADOR', dependenciaId: DEPENDENCIA_ID },
          { rol: 'RESPONSABLE_ESPACIO' },
        ],
      },
      admin,
      CONTEXTO,
    );

    expect(e.tx.usuarioRol.deleteMany).toHaveBeenCalledWith({ where: { usuarioId: USUARIO_ID } });
    expect(e.tx.usuarioRol.createMany).toHaveBeenCalledWith({
      data: [
        { usuarioId: USUARIO_ID, rol: 'SOLICITANTE', dependenciaId: null },
        { usuarioId: USUARIO_ID, rol: 'APROBADOR', dependenciaId: DEPENDENCIA_ID },
        { usuarioId: USUARIO_ID, rol: 'RESPONSABLE_ESPACIO', dependenciaId: null },
      ],
    });
    expect(e.sesiones.revocarTodas).toHaveBeenCalledWith(USUARIO_ID, e.tx);
    expect(e.tx.bitacora.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accion: 'USUARIO_ROLES_REEMPLAZADOS',
        datosAntes: { roles: [{ rol: 'SOLICITANTE', dependenciaId: null }] },
      }),
    });
  });

  it.each([
    ['APROBADOR sin dependencia', [{ rol: 'APROBADOR' as const }], 'DEPENDENCIA_REQUERIDA'],
    [
      'TESORERIA con dependencia',
      [{ rol: 'TESORERIA' as const, dependenciaId: DEPENDENCIA_ID }],
      'DEPENDENCIA_NO_ADMITIDA',
    ],
    [
      'una fila repetida',
      [{ rol: 'AUDITOR' as const }, { rol: 'AUDITOR' as const }],
      'ROL_DUPLICADO',
    ],
  ])('rechaza %s con 422 %s', async (_caso, roles, codigo) => {
    const e = crearEntorno();
    const error = await rechazo(e.servicio.reemplazarRoles(USUARIO_ID, { roles }, admin, CONTEXTO));
    expect(error).toMatchObject({ codigo, status: 422 });
    expect(e.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('una dependencia inexistente o archivada responde 404', async () => {
    const e = crearEntorno();
    e.prisma.dependencia.findMany.mockResolvedValue([]);
    const error = await rechazo(
      e.servicio.reemplazarRoles(
        USUARIO_ID,
        { roles: [{ rol: 'APROBADOR', dependenciaId: DEPENDENCIA_ID }] },
        admin,
        CONTEXTO,
      ),
    );
    expect(error).toMatchObject({ codigo: 'DEPENDENCIA_NO_ENCONTRADA', status: 404 });
  });

  it('no se quita ADMINISTRADOR al último administrador activo', async () => {
    const e = crearEntorno(fila({ roles: [{ rol: 'ADMINISTRADOR', dependenciaId: null }] }));
    e.tx.usuario.count.mockResolvedValue(0);
    const error = await rechazo(
      e.servicio.reemplazarRoles(USUARIO_ID, { roles: [{ rol: 'SOLICITANTE' }] }, admin, CONTEXTO),
    );
    expect(error).toMatchObject({ codigo: 'ULTIMO_ADMINISTRADOR', status: 409 });
    expect(e.tx.usuarioRol.deleteMany).not.toHaveBeenCalled();
    expect(e.sesiones.revocarTodas).not.toHaveBeenCalled();
  });

  it('mantener el rol ADMINISTRADOR no exige otro administrador', async () => {
    const e = crearEntorno(fila({ roles: [{ rol: 'ADMINISTRADOR', dependenciaId: null }] }));
    e.tx.usuario.count.mockResolvedValue(0);
    await expect(
      e.servicio.reemplazarRoles(
        USUARIO_ID,
        { roles: [{ rol: 'ADMINISTRADOR' }, { rol: 'AUDITOR' }] },
        admin,
        CONTEXTO,
      ),
    ).resolves.toBeDefined();
    expect(e.tx.usuario.count).not.toHaveBeenCalled();
    expect(e.tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('una lista vacía deja al usuario sin roles', async () => {
    const e = crearEntorno();
    await e.servicio.reemplazarRoles(USUARIO_ID, { roles: [] }, admin, CONTEXTO);
    expect(e.tx.usuarioRol.createMany).not.toHaveBeenCalled();
    expect(e.tx.usuarioRol.deleteMany).toHaveBeenCalledOnce();
  });
});
