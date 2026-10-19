import { describe, expect, it, vi } from 'vitest';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { DependenciasAdminService } from './dependencias-admin.service.js';

const CONTEXTO = { ip: '10.0.0.1', userAgent: 'vitest', correlacionId: 'corr-1' };
const DEPENDENCIA_ID = '8a3b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';
const JEFE_ID = '3f2b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';

const admin: UsuarioAutenticado = {
  id: 'u-admin',
  correo: 'admin@itp.edu.co',
  roles: ['ADMINISTRADOR'],
  dependencias: [],
  correoVerificado: true,
  esInstitucional: true,
};

const fila = (cambios: Record<string, unknown> = {}) => ({
  id: DEPENDENCIA_ID,
  codigo: 'ING-SIS',
  nombre: 'Ingeniería de Sistemas',
  centroCosto: 'CC-1',
  jefeId: JEFE_ID,
  activa: true,
  creadoEn: new Date('2026-10-01T15:00:00.000Z'),
  jefe: { id: JEFE_ID, correo: 'jefe@itp.edu.co' },
  ...cambios,
});

function crearEntorno(actual: unknown = fila()) {
  const tx = {
    dependencia: {
      create: vi.fn().mockResolvedValue(fila()),
      update: vi.fn().mockResolvedValue(fila({ nombre: 'Nuevo nombre' })),
    },
    bitacora: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    dependencia: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([fila()]),
      findUnique: vi.fn().mockResolvedValue(actual),
    },
    usuario: { findFirst: vi.fn().mockResolvedValue({ id: JEFE_ID }) },
    espacio: { count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn((fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { servicio: new DependenciasAdminService(prisma as unknown as PrismaService), prisma, tx };
}

const rechazo = (promesa: Promise<unknown>): Promise<unknown> => promesa.catch((e: unknown) => e);

describe('DependenciasAdminService', () => {
  it('lista paginada con el jefe y filtro por estado', async () => {
    const e = crearEntorno();
    const r = await e.servicio.listar({ activa: false, pagina: 1, porPagina: 50 });
    expect(e.prisma.dependencia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { activa: false }, skip: 0, take: 50 }),
    );
    expect(r.datos[0]).toMatchObject({ codigo: 'ING-SIS', jefe: { correo: 'jefe@itp.edu.co' } });
  });

  it('crea la dependencia con bitácora y valida el jefe', async () => {
    const e = crearEntorno();
    e.prisma.dependencia.findUnique.mockResolvedValue(null);
    const r = await e.servicio.crear(
      { codigo: 'ING-SIS', nombre: ' Ingeniería de Sistemas ', jefeId: JEFE_ID },
      admin,
      CONTEXTO,
    );

    expect(e.prisma.usuario.findFirst).toHaveBeenCalledWith({
      where: { id: JEFE_ID, activo: true },
      select: { id: true },
    });
    expect(e.tx.dependencia.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { codigo: 'ING-SIS', nombre: 'Ingeniería de Sistemas', centroCosto: null, jefeId: JEFE_ID },
      }),
    );
    expect(e.tx.bitacora.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ accion: 'DEPENDENCIA_CREADA', entidad: 'Dependencia' }),
    });
    expect(r.id).toBe(DEPENDENCIA_ID);
  });

  it('un código repetido responde 409 CODIGO_REGISTRADO', async () => {
    const e = crearEntorno();
    const error = await rechazo(e.servicio.crear({ codigo: 'ING-SIS', nombre: 'x' }, admin, CONTEXTO));
    expect(error).toMatchObject({ codigo: 'CODIGO_REGISTRADO', status: 409 });
  });

  it('una carrera por el código único (P2002) también responde 409', async () => {
    const e = crearEntorno();
    e.prisma.dependencia.findUnique.mockResolvedValue(null);
    e.prisma.$transaction.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
    const error = await rechazo(e.servicio.crear({ codigo: 'ING-SIS', nombre: 'x' }, admin, CONTEXTO));
    expect(error).toMatchObject({ codigo: 'CODIGO_REGISTRADO', status: 409 });
  });

  it('un jefe inexistente o inactivo responde 422 JEFE_NO_VALIDO', async () => {
    const e = crearEntorno();
    e.prisma.dependencia.findUnique.mockResolvedValue(null);
    e.prisma.usuario.findFirst.mockResolvedValue(null);
    const error = await rechazo(
      e.servicio.crear({ codigo: 'ING-SIS', nombre: 'x', jefeId: JEFE_ID }, admin, CONTEXTO),
    );
    expect(error).toMatchObject({ codigo: 'JEFE_NO_VALIDO', status: 422 });
  });

  it('actualiza solo lo enviado, permite quitar al jefe y deja antes y después', async () => {
    const e = crearEntorno();
    await e.servicio.actualizar(DEPENDENCIA_ID, { nombre: ' Nuevo nombre ', jefeId: null }, admin, CONTEXTO);

    expect(e.tx.dependencia.update).toHaveBeenCalledWith({
      where: { id: DEPENDENCIA_ID },
      data: { nombre: 'Nuevo nombre', jefe: { disconnect: true } },
      include: expect.anything(),
    });
    expect(e.prisma.usuario.findFirst).not.toHaveBeenCalled();
    expect(e.tx.bitacora.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accion: 'DEPENDENCIA_ACTUALIZADA',
        datosAntes: { nombre: 'Ingeniería de Sistemas', centroCosto: 'CC-1', jefeId: JEFE_ID },
      }),
    });
  });

  it('actualizar una dependencia inexistente responde 404', async () => {
    const e = crearEntorno(null);
    const error = await rechazo(e.servicio.actualizar(DEPENDENCIA_ID, { nombre: 'x' }, admin, CONTEXTO));
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
  });

  it('archiva una dependencia sin espacios activos', async () => {
    const e = crearEntorno();
    await e.servicio.archivar(DEPENDENCIA_ID, admin, CONTEXTO);
    expect(e.prisma.espacio.count).toHaveBeenCalledWith({
      where: { dependenciaId: DEPENDENCIA_ID, archivadoEn: null },
    });
    expect(e.tx.dependencia.update).toHaveBeenCalledWith({ where: { id: DEPENDENCIA_ID }, data: { activa: false } });
    expect(e.tx.bitacora.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ accion: 'DEPENDENCIA_ARCHIVADA', datosDespues: { activa: false } }),
    });
  });

  it('no archiva si tiene espacios activos: 409 con el conteo', async () => {
    const e = crearEntorno();
    e.prisma.espacio.count.mockResolvedValue(3);
    const error = await rechazo(e.servicio.archivar(DEPENDENCIA_ID, admin, CONTEXTO));
    expect(error).toMatchObject({
      codigo: 'DEPENDENCIA_CON_ESPACIOS',
      status: 409,
      detalles: { espacios: 3 },
    });
    expect(e.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('archivar una ya archivada es idempotente', async () => {
    const e = crearEntorno(fila({ activa: false }));
    await e.servicio.archivar(DEPENDENCIA_ID, admin, CONTEXTO);
    expect(e.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('restaura una archivada', async () => {
    const e = crearEntorno(fila({ activa: false }));
    await e.servicio.restaurar(DEPENDENCIA_ID, admin, CONTEXTO);
    expect(e.tx.dependencia.update).toHaveBeenCalledWith({ where: { id: DEPENDENCIA_ID }, data: { activa: true } });
    expect(e.tx.bitacora.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ accion: 'DEPENDENCIA_RESTAURADA' }),
    });
  });

  it('archivar o restaurar una inexistente responde 404', async () => {
    const e = crearEntorno(null);
    await expect(rechazo(e.servicio.archivar(DEPENDENCIA_ID, admin, CONTEXTO))).resolves.toMatchObject({
      codigo: 'NO_ENCONTRADO',
    });
    await expect(rechazo(e.servicio.restaurar(DEPENDENCIA_ID, admin, CONTEXTO))).resolves.toMatchObject({
      codigo: 'NO_ENCONTRADO',
    });
  });
});
