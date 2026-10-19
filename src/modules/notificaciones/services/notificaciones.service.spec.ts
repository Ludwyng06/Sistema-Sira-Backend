import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { CorreoPort } from '../correo/correo.port.js';
import { NotificacionesService, TIEMPO_MAXIMO_CORREO_MS } from './notificaciones.service.js';

const usuario: UsuarioAutenticado = {
  id: 'u-1',
  correo: 'ana@ejemplo.com',
  roles: ['SOLICITANTE'],
  dependencias: [],
  correoVerificado: true,
  esInstitucional: false,
};

function crearEntorno() {
  const prisma = {
    usuario: { findUnique: vi.fn().mockResolvedValue({ correo: 'ana@ejemplo.com', activo: true }) },
    solicitud: { findUnique: vi.fn().mockResolvedValue({ solicitante: { usuarioId: 'u-1' } }) },
    notificacion: {
      create: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue({ id: 'n-1' }),
    },
  };
  const correo = { enviar: vi.fn().mockResolvedValue(undefined) };
  const servicio = new NotificacionesService(
    prisma as unknown as PrismaService,
    correo as unknown as CorreoPort,
  );
  return { servicio, prisma, correo };
}

describe('NotificacionesService', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  describe('notificarUsuario', () => {
    it('guarda la notificación y envía el correo con el contenido escapado', async () => {
      const e = crearEntorno();
      await e.servicio.notificarUsuario('u-1', {
        titulo: 'Aprobada',
        cuerpo: 'Revisa <b>tu</b> solicitud & paga.',
        enlace: '/solicitudes/1',
      });

      expect(e.prisma.notificacion.create).toHaveBeenCalledWith({
        data: {
          usuarioId: 'u-1',
          titulo: 'Aprobada',
          cuerpo: 'Revisa <b>tu</b> solicitud & paga.',
          enlace: '/solicitudes/1',
        },
      });
      expect(e.correo.enviar).toHaveBeenCalledWith({
        para: 'ana@ejemplo.com',
        asunto: 'Aprobada',
        texto: 'Revisa <b>tu</b> solicitud & paga.',
        html: '<p>Revisa &lt;b&gt;tu&lt;/b&gt; solicitud &amp; paga.</p>',
      });
    });

    it('un usuario inactivo no recibe nada', async () => {
      const e = crearEntorno();
      e.prisma.usuario.findUnique.mockResolvedValue({ correo: 'x@x.co', activo: false });
      await e.servicio.notificarUsuario('u-1', { titulo: 't', cuerpo: 'c' });
      expect(e.prisma.notificacion.create).not.toHaveBeenCalled();
      expect(e.correo.enviar).not.toHaveBeenCalled();
    });

    it('si falla el correo no lanza y la notificación ya quedó guardada', async () => {
      const e = crearEntorno();
      e.correo.enviar.mockRejectedValue(new Error('SMTP caído'));
      await expect(e.servicio.notificarUsuario('u-1', { titulo: 't', cuerpo: 'c' })).resolves.toBeUndefined();
      expect(e.prisma.notificacion.create).toHaveBeenCalledOnce();
    });

    it('un servidor de correo que no responde no retiene el flujo más allá del límite', async () => {
      vi.useFakeTimers();
      try {
        const e = crearEntorno();
        e.correo.enviar.mockReturnValue(new Promise<void>(() => undefined));
        let terminado = false;
        const espera = e.servicio.notificarUsuario('u-1', { titulo: 't', cuerpo: 'c' }).then(() => {
          terminado = true;
        });

        await vi.advanceTimersByTimeAsync(TIEMPO_MAXIMO_CORREO_MS - 1);
        expect(terminado).toBe(false);
        await vi.advanceTimersByTimeAsync(2);
        await espera;
        expect(terminado).toBe(true);
        expect(e.prisma.notificacion.create).toHaveBeenCalledOnce();
      } finally {
        vi.useRealTimers();
      }
    });

    it('un correo que falla después de vencido el límite no genera un rechazo sin manejar', async () => {
      vi.useFakeTimers();
      try {
        const e = crearEntorno();
        let rechazar: (error: Error) => void = () => undefined;
        e.correo.enviar.mockReturnValue(new Promise<void>((_, r) => (rechazar = r)));
        const espera = e.servicio.notificarUsuario('u-1', { titulo: 't', cuerpo: 'c' });
        await vi.advanceTimersByTimeAsync(TIEMPO_MAXIMO_CORREO_MS + 1);
        await espera;
        rechazar(new Error('SMTP respondió tarde'));
        await vi.advanceTimersByTimeAsync(10);
      } finally {
        vi.useRealTimers();
      }
    });

    it('si falla la base de datos tampoco lanza', async () => {
      const e = crearEntorno();
      e.prisma.usuario.findUnique.mockRejectedValue(new Error('sin conexión'));
      await expect(e.servicio.notificarUsuario('u-1', { titulo: 't', cuerpo: 'c' })).resolves.toBeUndefined();
    });
  });

  describe('notificarSolicitante', () => {
    it('resuelve al dueño y agrega el enlace a la solicitud', async () => {
      const e = crearEntorno();
      await e.servicio.notificarSolicitante('sol-9', { titulo: 't', cuerpo: 'c' });
      expect(e.prisma.notificacion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ usuarioId: 'u-1', enlace: '/solicitudes/sol-9' }),
      });
    });

    it('una solicitud inexistente no hace nada', async () => {
      const e = crearEntorno();
      e.prisma.solicitud.findUnique.mockResolvedValue(null);
      await e.servicio.notificarSolicitante('x', { titulo: 't', cuerpo: 'c' });
      expect(e.prisma.notificacion.create).not.toHaveBeenCalled();
    });
  });

  describe('notificarAprobadores', () => {
    it('notifica al jefe y a los aprobadores sin repetir destinatarios', async () => {
      const e = crearEntorno();
      const prisma = e.prisma as unknown as Record<string, unknown>;
      prisma.dependencia = { findMany: vi.fn().mockResolvedValue([{ jefeId: 'u-jefe' }]) };
      prisma.usuarioRol = {
        findMany: vi.fn().mockResolvedValue([{ usuarioId: 'u-jefe' }, { usuarioId: 'u-apr' }]),
      };
      await e.servicio.notificarAprobadores(['dep-1', 'dep-1'], { titulo: 't', cuerpo: 'c' });

      expect(e.prisma.notificacion.create).toHaveBeenCalledTimes(2);
      expect(e.correo.enviar).toHaveBeenCalledTimes(2);
    });

    it('sin dependencias no consulta nada', async () => {
      const e = crearEntorno();
      await e.servicio.notificarAprobadores([], { titulo: 't', cuerpo: 'c' });
      expect(e.prisma.notificacion.create).not.toHaveBeenCalled();
    });
  });

  describe('listar', () => {
    it('lista solo las propias, con contador de no leídas', async () => {
      const e = crearEntorno();
      e.prisma.notificacion.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2);
      e.prisma.notificacion.findMany.mockResolvedValue([
        {
          id: 'n-1',
          titulo: 't',
          cuerpo: 'c',
          enlace: null,
          leidaEn: null,
          creadaEn: new Date('2026-10-22T15:00:00.000Z'),
        },
      ]);
      const r = await e.servicio.listar({ soloNoLeidas: true, pagina: 2, porPagina: 10 }, usuario);

      expect(e.prisma.notificacion.findMany).toHaveBeenCalledWith({
        where: { usuarioId: 'u-1', leidaEn: null },
        orderBy: { creadaEn: 'desc' },
        skip: 10,
        take: 10,
      });
      expect(r).toMatchObject({ total: 5, noLeidas: 2, pagina: 2, porPagina: 10 });
      expect(r.datos[0]).toEqual({
        id: 'n-1',
        titulo: 't',
        cuerpo: 'c',
        enlace: null,
        leida: false,
        creadaEn: '2026-10-22T15:00:00.000Z',
      });
    });
  });

  describe('marcarLeida', () => {
    it('marca la propia como leída', async () => {
      const e = crearEntorno();
      await expect(e.servicio.marcarLeida('n-1', usuario)).resolves.toBeUndefined();
      expect(e.prisma.notificacion.updateMany).toHaveBeenCalledWith({
        where: { id: 'n-1', usuarioId: 'u-1', leidaEn: null },
        data: { leidaEn: expect.any(Date) },
      });
    });

    it('es idempotente si ya estaba leída', async () => {
      const e = crearEntorno();
      e.prisma.notificacion.updateMany.mockResolvedValue({ count: 0 });
      await expect(e.servicio.marcarLeida('n-1', usuario)).resolves.toBeUndefined();
    });

    it('una notificación ajena o inexistente responde 404', async () => {
      const e = crearEntorno();
      e.prisma.notificacion.updateMany.mockResolvedValue({ count: 0 });
      e.prisma.notificacion.findFirst.mockResolvedValue(null);
      await expect(e.servicio.marcarLeida('n-9', usuario)).rejects.toMatchObject({
        codigo: 'NO_ENCONTRADO',
        status: 404,
      });
    });
  });
});
