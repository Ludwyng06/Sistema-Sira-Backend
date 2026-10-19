import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { BuscarDisponibilidadDto } from '../dto/buscar-disponibilidad.dto.js';
import { BusquedaService } from './busqueda.service.js';

const AHORA = new Date('2026-10-18T15:00:00.000Z');

const espacio = (codigo: string, capacidadPersonas: number) => ({
  id: `id-${codigo}`,
  codigo,
  nombre: `Aula ${codigo}`,
  piso: 1,
  capacidadPersonas,
  bloque: { codigo: 'B', nombre: 'Bloque B', sede: { codigo: 'MOC', nombre: 'Mocoa' } },
});

function crearEntorno(libres: unknown[] = []) {
  const prisma = { espacio: { findMany: vi.fn().mockResolvedValue(libres) } };
  return { servicio: new BusquedaService(prisma as unknown as PrismaService), prisma };
}

const consulta = (cambios: Partial<BuscarDisponibilidadDto> = {}): BuscarDisponibilidadDto => ({
  fecha: '2026-11-03',
  horaInicio: '08:00',
  horaFin: '12:00',
  asistentes: 40,
  ...cambios,
});

const rechazo = (promesa: Promise<unknown>): Promise<unknown> => promesa.catch((e: unknown) => e);

describe('BusquedaService.buscar', () => {
  it('ordena por ajuste: del que mejor encaja al más holgado', async () => {
    const { servicio } = crearEntorno([espacio('A-1', 200), espacio('B-2', 45), espacio('C-3', 60)]);
    const resultado = await servicio.buscar(consulta(), AHORA);

    expect(resultado.espacios.map((e) => e.codigo)).toEqual(['B-2', 'C-3', 'A-1']);
    expect(resultado.total).toBe(3);
    expect(resultado.espacios[0]).toMatchObject({
      espacioId: 'id-B-2',
      capacidadPersonas: 45,
      bloque: { codigo: 'B', nombre: 'Bloque B' },
      sede: { codigo: 'MOC', nombre: 'Mocoa' },
      aforo: { nivel: 'ADECUADO' },
    });
    expect(resultado.espacios[2]?.aforo.nivel).toBe('SOBRA_ESPACIO');
  });

  it('consulta con horario de Bogotá, aforo, sede y exclusión de franjas activas que cruzan', async () => {
    const { servicio, prisma } = crearEntorno();
    await servicio.buscar(consulta({ sedeId: 'sede-1' }), AHORA);

    const { where } = prisma.espacio.findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(where).toMatchObject({
      archivadoEn: null,
      esReservable: true,
      capacidadPersonas: { gte: 40 },
      bloque: { activo: true, sede: { activa: true, id: 'sede-1' } },
      franjas: {
        none: {
          estado: { not: 'LIBERADA' },
          inicio: { lt: new Date('2026-11-03T17:00:00.000Z') },
          fin: { gt: new Date('2026-11-03T13:00:00.000Z') },
        },
      },
    });
  });

  it('sin sede no filtra por sede', async () => {
    const { servicio, prisma } = crearEntorno();
    await servicio.buscar(consulta(), AHORA);
    const { where } = prisma.espacio.findMany.mock.calls[0]![0] as {
      where: { bloque: { sede: Record<string, unknown> } };
    };
    expect(where.bloque.sede).toEqual({ activa: true });
  });

  it('sin resultados devuelve una lista vacía', async () => {
    const { servicio } = crearEntorno([]);
    await expect(servicio.buscar(consulta(), AHORA)).resolves.toMatchObject({ espacios: [], total: 0 });
  });

  it.each([
    ['hora de fin igual a la de inicio', { horaFin: '08:00' }],
    ['hora de fin anterior a la de inicio', { horaFin: '07:00' }],
    ['fecha en el pasado', { fecha: '2026-10-17' }],
    ['fecha imposible', { fecha: '2026-13-45' }],
  ])('rechaza %s con 400 RANGO_INVALIDO', async (_caso, cambios) => {
    const { servicio, prisma } = crearEntorno();
    const error = await rechazo(servicio.buscar(consulta(cambios), AHORA));
    expect(error).toMatchObject({ codigo: 'RANGO_INVALIDO', status: 400 });
    expect(prisma.espacio.findMany).not.toHaveBeenCalled();
  });

  it('acepta buscar el mismo día', async () => {
    const { servicio } = crearEntorno();
    await expect(servicio.buscar(consulta({ fecha: '2026-10-18' }), AHORA)).resolves.toMatchObject({
      total: 0,
    });
  });
});
