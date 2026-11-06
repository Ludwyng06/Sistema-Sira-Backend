import { Logger, type CallHandler, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../shared/prisma/prisma.service.js';
import { Auditar } from './auditar.decorador.js';
import { AuditarInterceptor, redactar } from './auditar.interceptor.js';
import { AuditoriaService } from './services/auditoria.service.js';

beforeEach(() => {
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

describe('AuditoriaService.listar', () => {
  function crearEntorno() {
    const prisma = {
      bitacora: {
        count: vi.fn().mockResolvedValue(2),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 1205n,
            usuarioId: 'u-1',
            accion: 'SOLICITUD_ENVIADA',
            entidad: 'Solicitud',
            entidadId: 's-1',
            datosAntes: null,
            datosDespues: { consecutivo: 'SOL-2026-0001' },
            ip: '10.0.0.1',
            userAgent: 'vitest',
            correlacionId: 'corr-1',
            ocurrioEn: new Date('2026-10-22T15:00:00.000Z'),
          },
          {
            id: 1204n,
            usuarioId: null,
            accion: 'SOLICITUD_VENCIDA',
            entidad: 'Solicitud',
            entidadId: 's-2',
            datosAntes: null,
            datosDespues: null,
            ip: null,
            userAgent: null,
            correlacionId: null,
            ocurrioEn: new Date('2026-10-22T14:00:00.000Z'),
          },
        ]),
      },
      usuario: { findMany: vi.fn().mockResolvedValue([{ id: 'u-1', correo: 'ana@itp.edu.co' }]) },
    };
    return { servicio: new AuditoriaService(prisma as unknown as PrismaService), prisma };
  }

  it('lista paginada con el correo del usuario y el id como texto', async () => {
    const e = crearEntorno();
    const r = await e.servicio.listar({
      entidad: 'Solicitud',
      accion: 'SOLICITUD_ENVIADA',
      desde: '2026-10-01T00:00:00.000Z',
      hasta: '2026-10-31T00:00:00.000Z',
      pagina: 2,
      porPagina: 10,
    });

    expect(e.prisma.bitacora.findMany).toHaveBeenCalledWith({
      where: {
        entidad: 'Solicitud',
        accion: 'SOLICITUD_ENVIADA',
        ocurrioEn: { gte: new Date('2026-10-01T00:00:00.000Z'), lte: new Date('2026-10-31T00:00:00.000Z') },
      },
      orderBy: { id: 'desc' },
      skip: 10,
      take: 10,
    });
    expect(r).toMatchObject({ total: 2, pagina: 2, porPagina: 10 });
    expect(r.datos[0]).toMatchObject({ id: '1205', usuarioCorreo: 'ana@itp.edu.co', ip: '10.0.0.1' });
    expect(r.datos[1]).toMatchObject({ id: '1204', usuarioId: null, usuarioCorreo: null });
  });

  it('un rango invertido responde 400 RANGO_INVALIDO', async () => {
    const e = crearEntorno();
    await expect(
      e.servicio.listar({
        desde: '2026-10-31T00:00:00.000Z',
        hasta: '2026-10-01T00:00:00.000Z',
        pagina: 1,
        porPagina: 50,
      }),
    ).rejects.toMatchObject({ codigo: 'RANGO_INVALIDO', status: 400 });
  });
});

describe('AuditarInterceptor', () => {
  class Controlador {
    @Auditar('ESPACIO_ARCHIVADO', 'Espacio')
    auditado(): void {}

    sinAuditar(): void {}
  }

  function contextoDe(metodo: keyof Controlador, peticion: Record<string, unknown>): ExecutionContext {
    return {
      getHandler: () => Controlador.prototype[metodo],
      switchToHttp: () => ({ getRequest: () => peticion }),
    } as unknown as ExecutionContext;
  }

  const peticion = {
    user: { id: 'u-1' },
    params: { id: 'esp-1' },
    ip: '10.0.0.1',
    headers: { 'user-agent': 'vitest', 'x-correlation-id': 'corr-1' },
  };

  function crearInterceptor() {
    const prisma = { bitacora: { create: vi.fn().mockResolvedValue({}) } };
    const interceptor = new AuditarInterceptor(new Reflector(), prisma as unknown as PrismaService);
    return { interceptor, prisma };
  }

  it('registra la acción con usuario, entidad, ip y correlación, y devuelve la respuesta intacta', async () => {
    const { interceptor, prisma } = crearInterceptor();
    const siguiente: CallHandler = { handle: () => of({ id: 'esp-1', estado: 'ARCHIVADO' }) };
    const salida = await lastValueFrom(interceptor.intercept(contextoDe('auditado', peticion), siguiente));

    expect(salida).toEqual({ id: 'esp-1', estado: 'ARCHIVADO' });
    expect(prisma.bitacora.create).toHaveBeenCalledWith({
      data: {
        usuarioId: 'u-1',
        accion: 'ESPACIO_ARCHIVADO',
        entidad: 'Espacio',
        entidadId: 'esp-1',
        datosDespues: { id: 'esp-1', estado: 'ARCHIVADO' },
        ip: '10.0.0.1',
        userAgent: 'vitest',
        correlacionId: 'corr-1',
      },
    });
  });

  it('toma el id de la respuesta si la ruta no tiene parámetro', async () => {
    const { interceptor, prisma } = crearInterceptor();
    const siguiente: CallHandler = { handle: () => of({ id: 'nuevo-9' }) };
    await lastValueFrom(
      interceptor.intercept(contextoDe('auditado', { ...peticion, params: {} }), siguiente),
    );
    expect(prisma.bitacora.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entidadId: 'nuevo-9' }),
    });
  });

  it('no registra si el método no está marcado', async () => {
    const { interceptor, prisma } = crearInterceptor();
    await lastValueFrom(interceptor.intercept(contextoDe('sinAuditar', peticion), { handle: () => of(1) }));
    expect(prisma.bitacora.create).not.toHaveBeenCalled();
  });

  it('si la bitácora falla, la respuesta igual llega al cliente', async () => {
    const { interceptor, prisma } = crearInterceptor();
    prisma.bitacora.create.mockRejectedValue(new Error('base caída'));
    const salida = await lastValueFrom(
      interceptor.intercept(contextoDe('auditado', peticion), { handle: () => of({ id: 'x' }) }),
    );
    expect(salida).toEqual({ id: 'x' });
  });

  it('no guarda contraseñas, tokens ni códigos de verificación de la respuesta', async () => {
    const { interceptor, prisma } = crearInterceptor();
    const respuesta = {
      id: 'u-9',
      correo: 'ana@itp.edu.co',
      contrasena: 'Clave-secreta-2026',
      accessToken: 'eyJ.abc.def',
      refreshToken: 'r-secreto',
      anidado: { hashContrasena: '$argon2id$...', codigo: '482913', mensaje: 'ok' },
      lista: [{ token: 'x', nombre: 'Aula' }],
    };
    await lastValueFrom(
      interceptor.intercept(contextoDe('auditado', peticion), { handle: () => of(respuesta) }),
    );

    const { data } = prisma.bitacora.create.mock.calls[0]![0] as { data: { datosDespues: unknown } };
    expect(data.datosDespues).toEqual({
      id: 'u-9',
      correo: 'ana@itp.edu.co',
      contrasena: '[REDACTADO]',
      accessToken: '[REDACTADO]',
      refreshToken: '[REDACTADO]',
      anidado: { hashContrasena: '[REDACTADO]', codigo: '[REDACTADO]', mensaje: 'ok' },
      lista: [{ token: '[REDACTADO]', nombre: 'Aula' }],
    });
    expect(JSON.stringify(data.datosDespues)).not.toContain('Clave-secreta-2026');
  });

  it('redactar conserva los códigos de entidades (no son de 6 dígitos) y corta estructuras muy profundas', () => {
    expect(redactar({ codigo: 'A-101', otro: { codigo: '123456' } })).toEqual({
      codigo: 'A-101',
      otro: { codigo: '[REDACTADO]' },
    });
    let profundo: Record<string, unknown> = { fin: 'x' };
    for (let i = 0; i < 20; i += 1) profundo = { nivel: profundo };
    expect(JSON.stringify(redactar(profundo))).toContain('[REDACTADO]');
  });

  it('una respuesta enorme se resume en lugar de guardarse completa', async () => {
    const { interceptor, prisma } = crearInterceptor();
    const grande = { id: 'x', datos: 'a'.repeat(10_000) };
    await lastValueFrom(interceptor.intercept(contextoDe('auditado', peticion), { handle: () => of(grande) }));
    expect(prisma.bitacora.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ datosDespues: { truncado: true } }),
    });
  });
});
