import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParametroService } from '../../../shared/parametros/parametro.service.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { NotificacionesService } from '../../notificaciones/services/notificaciones.service.js';
import { ACCION_ESCALAMIENTO, ACCION_RECORDATORIO, RecordatoriosService } from './recordatorios.service.js';

const AHORA = new Date('2026-10-26T15:00:00.000Z');
const horasAtras = (horas: number) => new Date(AHORA.getTime() - horas * 3_600_000);

beforeEach(() => {
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
});

const solicitud = (cambios: Record<string, unknown> = {}) => ({
  id: 'sol-1',
  consecutivo: 'SOL-2026-0001',
  enviadaEn: horasAtras(30),
  reservas: [{ espacio: { responsableId: 'u-resp', dependenciaId: 'dep-1', requiereAval: true } }],
  decisiones: [] as { tipo: string; resultado: string; decididaEn: Date }[],
  ...cambios,
});

function crearEntorno(candidatas: unknown[] = [solicitud()], avisadas: unknown[] = []) {
  const prisma = {
    solicitud: { findMany: vi.fn().mockResolvedValue(candidatas) },
    bitacora: {
      findMany: vi.fn().mockResolvedValue(avisadas),
      create: vi.fn().mockResolvedValue({}),
    },
    usuarioRol: { findMany: vi.fn().mockResolvedValue([{ usuarioId: 'u-adm' }, { usuarioId: 'u-adm' }]) },
  };
  const parametros = {
    obtenerNumero: vi.fn((clave: string) =>
      Promise.resolve(clave === 'horas_recordatorio_aprobador' ? 24 : 48),
    ),
  };
  const notificaciones = {
    notificarUsuario: vi.fn().mockResolvedValue(undefined),
    notificarAprobadores: vi.fn().mockResolvedValue(undefined),
  };
  const servicio = new RecordatoriosService(
    prisma as unknown as PrismaService,
    parametros as unknown as ParametroService,
    notificaciones as unknown as NotificacionesService,
  );
  return { servicio, prisma, notificaciones };
}

describe('RecordatoriosService.ejecutar', () => {
  it('busca solicitudes en revisión con más de 24 h y plazo vigente', async () => {
    const e = crearEntorno([]);
    await e.servicio.ejecutar(AHORA);
    expect(e.prisma.solicitud.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          estado: 'EN_REVISION',
          enviadaEn: { not: null, lte: horasAtras(24) },
          venceEn: { gt: AHORA },
        },
      }),
    );
  });

  it('sin aval recuerda al responsable; a las 24-48 h no escala', async () => {
    const e = crearEntorno([solicitud({ enviadaEn: horasAtras(30) })]);
    const r = await e.servicio.ejecutar(AHORA);

    expect(r).toEqual({ recordatorios: 1, escalamientos: 0 });
    expect(e.notificaciones.notificarUsuario).toHaveBeenCalledWith(
      'u-resp',
      expect.objectContaining({ titulo: 'Recordatorio: solicitud SOL-2026-0001 espera tu aval' }),
    );
    expect(e.notificaciones.notificarAprobadores).not.toHaveBeenCalled();
    expect(e.prisma.bitacora.create).toHaveBeenCalledWith({
      data: {
        usuarioId: null,
        accion: ACCION_RECORDATORIO,
        entidad: 'Solicitud',
        entidadId: 'sol-1',
        ocurrioEn: AHORA,
      },
    });
  });

  it('con el aval otorgado recuerda a los aprobadores de la dependencia', async () => {
    const e = crearEntorno([
      solicitud({
        decisiones: [{ tipo: 'AVAL', resultado: 'APROBADA', decididaEn: horasAtras(10) }],
      }),
    ]);
    await e.servicio.ejecutar(AHORA);

    expect(e.notificaciones.notificarAprobadores).toHaveBeenCalledWith(
      ['dep-1'],
      expect.objectContaining({ titulo: 'Recordatorio: solicitud SOL-2026-0001 espera tu aprobación' }),
    );
    expect(e.notificaciones.notificarUsuario).not.toHaveBeenCalled();
  });

  it('un aval anterior al último envío no cuenta', async () => {
    const e = crearEntorno([
      solicitud({ decisiones: [{ tipo: 'AVAL', resultado: 'APROBADA', decididaEn: horasAtras(100) }] }),
    ]);
    await e.servicio.ejecutar(AHORA);
    expect(e.notificaciones.notificarUsuario).toHaveBeenCalledWith('u-resp', expect.anything());
  });

  it('si ningún espacio exige aval recuerda directamente a los aprobadores', async () => {
    const e = crearEntorno([
      solicitud({
        reservas: [{ espacio: { responsableId: 'u-resp', dependenciaId: 'dep-1', requiereAval: false } }],
      }),
    ]);
    await e.servicio.ejecutar(AHORA);
    expect(e.notificaciones.notificarAprobadores).toHaveBeenCalledOnce();
  });

  it('a las 48 h escala a los administradores, sin repetir destinatarios', async () => {
    const e = crearEntorno([solicitud({ enviadaEn: horasAtras(50) })]);
    const r = await e.servicio.ejecutar(AHORA);

    expect(r).toEqual({ recordatorios: 1, escalamientos: 1 });
    const escalamiento = e.notificaciones.notificarUsuario.mock.calls.filter(
      ([, c]) => (c as { titulo: string }).titulo.startsWith('Escalamiento'),
    );
    expect(escalamiento).toHaveLength(1);
    expect(escalamiento[0]?.[0]).toBe('u-adm');
    expect(e.prisma.bitacora.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ accion: ACCION_ESCALAMIENTO }),
    });
  });

  it('no repite avisos ya registrados en la bitácora', async () => {
    const e = crearEntorno(
      [solicitud({ enviadaEn: horasAtras(50) })],
      [
        { accion: ACCION_RECORDATORIO, entidadId: 'sol-1' },
        { accion: ACCION_ESCALAMIENTO, entidadId: 'sol-1' },
      ],
    );
    const r = await e.servicio.ejecutar(AHORA);

    expect(r).toEqual({ recordatorios: 0, escalamientos: 0 });
    expect(e.notificaciones.notificarUsuario).not.toHaveBeenCalled();
    expect(e.prisma.bitacora.create).not.toHaveBeenCalled();
  });

  it('un error en una solicitud no detiene a las demás', async () => {
    const e = crearEntorno([solicitud({ id: 'sol-1' }), solicitud({ id: 'sol-2' })]);
    e.prisma.bitacora.create.mockRejectedValueOnce(new Error('base caída'));
    const r = await e.servicio.ejecutar(AHORA);
    expect(r.recordatorios).toBe(1);
  });
});

describe('RecordatoriosService.programado', () => {
  it('no propaga errores', async () => {
    const e = crearEntorno();
    e.prisma.solicitud.findMany.mockRejectedValue(new Error('sin base'));
    await expect(e.servicio.programado()).resolves.toBeUndefined();
  });
});
