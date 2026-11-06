import { describe, expect, it, vi } from 'vitest';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ActaPdfService } from './acta-pdf.service.js';
import type { ActasService } from './actas.service.js';

const usuario: UsuarioAutenticado = {
  id: 'u-resp',
  correo: 'resp@itp.edu.co',
  roles: ['RESPONSABLE_ESPACIO'],
  dependencias: [],
  correoVerificado: true,
  esInstitucional: true,
};

const acta = {
  id: 'acta-1',
  consecutivo: 'ACT-2026-0001',
  solicitudId: 'sol-1',
  tipo: 'DEVOLUCION' as const,
  estadoSolicitud: 'FINALIZADA' as const,
  checklist: [
    {
      elementoId: 'e1',
      nombre: 'Videobeam',
      cantidadEsperada: 1,
      cantidadEncontrada: 1,
      estadoFisico: 'MALO' as const,
      ok: false,
    },
    {
      elementoId: 'e2',
      nombre: 'Sillas',
      cantidadEsperada: 40,
      cantidadEncontrada: 40,
      estadoFisico: 'BUENO' as const,
      ok: true,
    },
  ],
  observaciones: 'Se entrega el espacio limpio.',
  novedades: [
    { id: 'n1', elementoId: 'e1', descripcion: 'Lente rayado.', valorDano: 150_000, tratamiento: 'DESCONTAR_DEPOSITO' },
  ],
  generadaEn: '2026-11-03T22:00:00.000Z',
};

function crearEntorno(contexto: unknown = {
  consecutivo: 'SOL-2026-0001',
  objetoEvento: 'Congreso',
  solicitante: { nombres: 'Ana', apellidos: 'Pérez', razonSocial: null },
  reservas: [
    { espacio: { codigo: 'B-101', nombre: 'Auditorio' } },
    { espacio: { codigo: 'B-101', nombre: 'Auditorio' } },
  ],
}) {
  const prisma = { solicitud: { findUnique: vi.fn().mockResolvedValue(contexto) } };
  const actas = { obtener: vi.fn().mockResolvedValue(acta) };
  const servicio = new ActaPdfService(prisma as unknown as PrismaService, actas as unknown as ActasService);
  return { servicio, prisma, actas };
}

describe('ActaPdfService.generar', () => {
  it('valida el alcance con el servicio de actas y genera un PDF válido', async () => {
    const e = crearEntorno();
    const r = await e.servicio.generar('acta-1', usuario);

    expect(e.actas.obtener).toHaveBeenCalledWith('acta-1', usuario);
    expect(r.nombre).toBe('ACT-2026-0001.pdf');
    expect(r.contenido.subarray(0, 5).toString()).toBe('%PDF-');
    expect(r.contenido.length).toBeGreaterThan(1_000);
  });

  it('un acta fuera de alcance no genera nada', async () => {
    const e = crearEntorno();
    e.actas.obtener.mockRejectedValue(Object.assign(new Error('no existe'), { status: 404 }));
    await expect(e.servicio.generar('x', usuario)).rejects.toMatchObject({ status: 404 });
    expect(e.prisma.solicitud.findUnique).not.toHaveBeenCalled();
  });

  it('si la solicitud ya no existe responde 404', async () => {
    const e = crearEntorno(null);
    await expect(e.servicio.generar('acta-1', usuario)).rejects.toMatchObject({
      codigo: 'NO_ENCONTRADO',
      status: 404,
    });
  });
});
