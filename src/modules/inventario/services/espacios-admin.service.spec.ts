import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { NotificacionesService } from '../../notificaciones/services/notificaciones.service.js';
import { EspaciosAdminService } from './espacios-admin.service.js';

const ID = '8a3b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';
const fila = {
  id: ID, codigo: 'A-101', nombre: 'Aula 101', piso: 1, capacidadPersonas: 40,
  areaM2: { toString: () => '48.50' }, descripcion: null, condicionesUso: 'Sin alimentos',
  estado: 'FUERA_DE_SERVICIO', requiereAval: true, esReservable: false,
  minutosMontaje: 15, minutosDesmontaje: 10, depositoValorFijo: 10000,
  depositoPorcentaje: { toString: () => '5.25' }, responsableId: ID, dependenciaId: ID,
  archivadoEn: new Date(), tipo: { codigo: 'AULA', nombre: 'Aula' },
  dependencia: { codigo: 'BIBLIOTECA' },
  bloque: { id: ID, codigo: 'A', nombre: 'Bloque A', numeroPisos: 3, sede: { codigo: 'MOC', nombre: 'Mocoa' } },
  horarios: [{ diaSemana: 1, abre: '08:00', cierra: '18:00' }],
};

function entorno() {
  const prisma = {
    espacio: {
      findMany: vi.fn().mockResolvedValue([fila]), count: vi.fn().mockResolvedValue(1),
      findUnique: vi.fn().mockResolvedValue(fila), create: vi.fn().mockResolvedValue(fila),
      findFirst: vi.fn().mockResolvedValue(fila), update: vi.fn().mockResolvedValue(fila),
    },
    bloque: { findFirst: vi.fn().mockResolvedValue(fila.bloque) },
    tipoEspacio: { findUnique: vi.fn().mockResolvedValue({ id: ID, ...fila.tipo }) },
    usuario: { findFirst: vi.fn().mockResolvedValue({ id: ID }) },
  };
  const servicio = new EspaciosAdminService(prisma as unknown as PrismaService, {} as NotificacionesService);
  return { servicio, prisma };
}

describe('Gestión administrativa de espacios', () => {
  it('proyecta datos administrativos y decimales sin aplicar filtros públicos', async () => {
    const e = entorno();
    const r = await e.servicio.listar({ pagina: 2, porPagina: 10 });
    expect(e.prisma.espacio.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { bloque: {} }, skip: 10, take: 10, orderBy: { codigo: 'asc' },
      include: expect.objectContaining({ horarios: { orderBy: { diaSemana: 'asc' } } }),
    }));
    expect(r).toMatchObject({ pagina: 2, porPagina: 10, total: 1, datos: [{
      id: ID, estado: 'FUERA_DE_SERVICIO', esReservable: false, activo: false,
      areaM2: 48.5, depositoPorcentaje: 5.25, dependenciaCodigo: 'BIBLIOTECA', responsableId: ID,
      horarios: fila.horarios,
    }] });
  });

  it.each([true, false])('filtra activo=%s por archivo y combina filtros de sede/bloque/estado', async (activo) => {
    const e = entorno();
    await e.servicio.listar({ pagina: 1, porPagina: 20, activo, sede: 'moc', sedeId: ID,
      bloque: 'a', bloqueId: ID, estado: 'EN_MANTENIMIENTO' });
    expect(e.prisma.espacio.count).toHaveBeenCalledWith({ where: {
      archivadoEn: activo ? null : { not: null }, estado: 'EN_MANTENIMIENTO', bloqueId: ID,
      bloque: { codigo: 'A', sedeId: ID, sede: { codigo: 'MOC' } },
    } });
  });

  it('obtiene también archivados normalizando el código, conserva nulos y responde 404 si no existe', async () => {
    const e = entorno();
    e.prisma.espacio.findUnique.mockResolvedValue({ ...fila, areaM2: null, depositoPorcentaje: null, dependencia: null } as never);
    expect(await e.servicio.obtener('a-101')).toMatchObject({ activo: false, areaM2: null,
      depositoPorcentaje: null, dependenciaCodigo: null });
    expect(e.prisma.espacio.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { codigo: 'A-101' } }));
    e.prisma.espacio.findUnique.mockResolvedValue(null as never);
    await expect(e.servicio.obtener('no-existe')).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
  });

  it('crea el espacio con responsable activo y rechaza uno inexistente o inactivo', async () => {
    const e = entorno();
    e.prisma.espacio.findUnique.mockResolvedValue(null as never);
    const datos = { sede: 'MOC', bloque: 'A', tipo: 'AULA', codigo: 'A-101', nombre: 'Aula',
      piso: 1, capacidadPersonas: 30, responsableId: ID };
    await e.servicio.crear(datos);
    expect(e.prisma.usuario.findFirst).toHaveBeenCalledWith({ where: { id: ID, activo: true }, select: { id: true } });
    expect(e.prisma.espacio.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ responsableId: ID }) }));
    e.prisma.usuario.findFirst.mockResolvedValue(null as never);
    e.prisma.espacio.create.mockClear();
    await expect(e.servicio.crear(datos)).rejects.toMatchObject({ codigo: 'RESPONSABLE_NO_VALIDO', status: 422 });
    expect(e.prisma.espacio.create).not.toHaveBeenCalled();
  });

  describe('aval y responsable', () => {
    const MENSAJE = 'Asigna un responsable al espacio antes de exigir su aval.';
    const nuevo = { sede: 'MOC', bloque: 'A', tipo: 'AULA', codigo: 'A-102', nombre: 'Aula', piso: 1, capacidadPersonas: 30 };

    it('crear con requiereAval=true y sin responsable da 422 AVAL_SIN_RESPONSABLE', async () => {
      const e = entorno();
      e.prisma.espacio.findUnique.mockResolvedValue(null as never);
      await expect(e.servicio.crear({ ...nuevo, requiereAval: true })).rejects.toMatchObject({
        codigo: 'AVAL_SIN_RESPONSABLE', status: 422, message: MENSAJE,
      });
      expect(e.prisma.espacio.create).not.toHaveBeenCalled();
    });

    it('crear sin indicar requiereAval lo exige solo si hay responsable', async () => {
      const e = entorno();
      e.prisma.espacio.findUnique.mockResolvedValue(null as never);
      await e.servicio.crear(nuevo);
      expect(e.prisma.espacio.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ requiereAval: false }) }),
      );
      await e.servicio.crear({ ...nuevo, responsableId: ID });
      expect(e.prisma.espacio.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ requiereAval: true, responsableId: ID }) }),
      );
    });

    it('actualizar no permite exigir aval en un espacio sin responsable', async () => {
      const e = entorno();
      e.prisma.espacio.findFirst.mockResolvedValue({ ...fila, requiereAval: false, responsableId: null } as never);
      await expect(e.servicio.actualizar('A-101', { requiereAval: true })).rejects.toMatchObject({
        codigo: 'AVAL_SIN_RESPONSABLE', status: 422, message: MENSAJE,
      });
      expect(e.prisma.espacio.update).not.toHaveBeenCalled();
    });

    it('actualizar no permite quitar el responsable de un espacio que exige aval', async () => {
      const e = entorno();
      await expect(e.servicio.actualizar('A-101', { responsableId: null })).rejects.toMatchObject({
        codigo: 'AVAL_SIN_RESPONSABLE', status: 422,
      });
      expect(e.prisma.espacio.update).not.toHaveBeenCalled();
    });

    it('se puede quitar el responsable si a la vez se deja de exigir el aval, y asignar uno y exigirlo', async () => {
      const e = entorno();
      await e.servicio.actualizar('A-101', { responsableId: null, requiereAval: false });
      expect(e.prisma.espacio.update).toHaveBeenCalledTimes(1);
      e.prisma.espacio.findFirst.mockResolvedValue({ ...fila, requiereAval: false, responsableId: null } as never);
      await e.servicio.actualizar('A-101', { responsableId: ID, requiereAval: true });
      expect(e.prisma.espacio.update).toHaveBeenCalledTimes(2);
    });

    it('editar otros datos de un espacio antiguo sin responsable no se bloquea', async () => {
      const e = entorno();
      e.prisma.espacio.findFirst.mockResolvedValue({ ...fila, requiereAval: true, responsableId: null } as never);
      await e.servicio.actualizar('A-101', { nombre: 'Aula nueva' });
      expect(e.prisma.espacio.update).toHaveBeenCalledTimes(1);
    });
  });

  it('calcula valorTotalElementos y permite restaurar un espacio archivado cuando sede y bloque están activos', async () => {
    const e = entorno();
    e.prisma.espacio.findUnique.mockResolvedValueOnce({
      ...fila,
      valorComercialReferencia: 25_000_000,
      elementos: [
        { cantidad: 1, valorUnitario: 2_400_000 },
        { cantidad: 25, valorUnitario: 180_000 },
      ],
    } as never);
    const detalle = await e.servicio.obtener('A-101');
    expect(detalle.valorComercialReferencia).toBe(25_000_000);
    expect(detalle.valorTotalElementos).toBe(6_900_000);

    e.prisma.espacio.findUnique.mockResolvedValueOnce({
      ...fila,
      archivadoEn: new Date(),
      bloque: { ...fila.bloque, activo: true, sede: { ...fila.bloque.sede, activa: true } },
    } as never);
    await e.servicio.restaurar('a-101');
    expect(e.prisma.espacio.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { archivadoEn: null },
    });
  });
});
