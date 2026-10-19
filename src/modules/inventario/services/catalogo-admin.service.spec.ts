import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { BloquesAdminService } from './bloques-admin.service.js';
import { ElementosAdminService } from './elementos-admin.service.js';
import { EspaciosAdminService } from './espacios-admin.service.js';
import { SedesAdminService } from './sedes-admin.service.js';
import { TiposEspacioAdminService } from './tipos-espacio-admin.service.js';

const ID = '8a3b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';
const OTRO_ID = '3f2b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';

const rechazo = (promesa: Promise<unknown>): Promise<unknown> =>
  promesa.catch((e: unknown) => e);
const comoPrisma = (prisma: unknown) => prisma as PrismaService;

const sede = (cambios: Record<string, unknown> = {}) => ({
  id: ID,
  codigo: 'MOC',
  nombre: 'Mocoa',
  municipio: 'Mocoa',
  direccion: null,
  telefono: null,
  orden: 0,
  activa: true,
  _count: { bloques: 0 },
  ...cambios,
});

const bloque = (cambios: Record<string, unknown> = {}) => ({
  id: ID,
  sedeId: OTRO_ID,
  codigo: 'A',
  nombre: 'Bloque A',
  descripcion: null,
  numeroPisos: 3,
  orden: 0,
  activo: true,
  sede: { codigo: 'MOC' },
  _count: { espacios: 0 },
  ...cambios,
});

const tipo = (cambios: Record<string, unknown> = {}) => ({
  id: ID,
  codigo: 'AULA',
  nombre: 'Aula',
  anticipacionMinimaDias: 3,
  anticipacionEnHabiles: true,
  aforoExigePoliza: null,
  icono: null,
  activo: true,
  _count: { espacios: 0 },
  ...cambios,
});

const elemento = (cambios: Record<string, unknown> = {}) => ({
  id: ID,
  espacioId: OTRO_ID,
  placaInventario: 'ITP-1',
  nombre: 'Videobeam',
  marca: null,
  modelo: null,
  serie: null,
  cantidad: 1,
  unidad: 'unidad',
  estadoFisico: 'BUENO',
  estado: 'EN_SERVICIO',
  valorUnitario: 2_500_000,
  fechaAdquisicion: new Date('2024-03-15T00:00:00.000Z'),
  vidaUtilMeses: null,
  esPrestable: true,
  espacio: { codigo: 'A-101' },
  ...cambios,
});

describe('SedesAdminService', () => {
  function entorno(actual: unknown = sede()) {
    const prisma = {
      sede: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([sede()]),
        findUnique: vi.fn().mockResolvedValue(actual),
        create: vi.fn().mockResolvedValue(sede()),
        update: vi.fn().mockResolvedValue(sede({ activa: false })),
      },
    };
    return { servicio: new SedesAdminService(comoPrisma(prisma)), prisma };
  }

  it('lista paginada con el filtro de estado', async () => {
    const e = entorno();
    const r = await e.servicio.listar({
      activo: false,
      pagina: 2,
      porPagina: 10,
    });
    expect(e.prisma.sede.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { activa: false }, skip: 10, take: 10 }),
    );
    expect(r).toMatchObject({ total: 1, pagina: 2, porPagina: 10 });
    expect(r.datos[0]).toMatchObject({ codigo: 'MOC', bloquesActivos: 0 });
  });

  it('crea una sede con los textos recortados', async () => {
    const e = entorno(null);
    await e.servicio.crear({
      codigo: 'PUE',
      nombre: ' Puerto Asís ',
      municipio: ' Puerto Asís ',
    });
    expect(e.prisma.sede.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          codigo: 'PUE',
          nombre: 'Puerto Asís',
          municipio: 'Puerto Asís',
        }),
      }),
    );
  });

  it('rechaza un código repetido con 409', async () => {
    const e = entorno(sede());
    expect(
      await rechazo(
        e.servicio.crear({ codigo: 'MOC', nombre: 'X', municipio: 'X' }),
      ),
    ).toMatchObject({
      codigo: 'CODIGO_REGISTRADO',
      status: 409,
    });
    expect(e.prisma.sede.create).not.toHaveBeenCalled();
  });

  it('no archiva una sede con bloques activos', async () => {
    const e = entorno(sede({ _count: { bloques: 2 } }));
    expect(await rechazo(e.servicio.archivar(ID))).toMatchObject({
      codigo: 'SEDE_CON_BLOQUES',
      status: 409,
    });
    expect(e.prisma.sede.update).not.toHaveBeenCalled();
  });

  it('archiva una sede sin bloques y es idempotente', async () => {
    const e = entorno();
    await e.servicio.archivar(ID);
    expect(e.prisma.sede.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { activa: false } }),
    );

    const ya = entorno(sede({ activa: false }));
    await ya.servicio.archivar(ID);
    expect(ya.prisma.sede.update).not.toHaveBeenCalled();
  });

  it('responde 404 si la sede no existe', async () => {
    const e = entorno(null);
    expect(await rechazo(e.servicio.obtener(ID))).toMatchObject({
      status: 404,
    });
    expect(
      await rechazo(e.servicio.actualizar(ID, { nombre: 'X' })),
    ).toMatchObject({ status: 404 });
    expect(await rechazo(e.servicio.restaurar(ID))).toMatchObject({
      status: 404,
    });
  });
});

describe('BloquesAdminService', () => {
  function entorno(actual: unknown = bloque(), sedeActiva = true) {
    const prisma = {
      sede: { findUnique: vi.fn().mockResolvedValue({ activa: sedeActiva }) },
      bloque: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([bloque()]),
        findUnique: vi.fn().mockResolvedValue(actual),
        create: vi.fn().mockResolvedValue(bloque()),
        update: vi.fn().mockResolvedValue(bloque({ activo: false })),
      },
      espacio: { count: vi.fn().mockResolvedValue(0) },
    };
    return { servicio: new BloquesAdminService(comoPrisma(prisma)), prisma };
  }

  it('lista filtrando por sede y estado', async () => {
    const e = entorno();
    const r = await e.servicio.listar({
      sedeId: OTRO_ID,
      activo: true,
      pagina: 1,
      porPagina: 50,
    });
    expect(e.prisma.bloque.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { activo: true, sedeId: OTRO_ID } }),
    );
    expect(r.datos[0]).toMatchObject({ sedeCodigo: 'MOC', espaciosActivos: 0 });
  });

  it('no crea bloques en una sede archivada', async () => {
    const e = entorno(null, false);
    expect(
      await rechazo(
        e.servicio.crear({
          sedeId: OTRO_ID,
          codigo: 'D',
          nombre: 'D',
          numeroPisos: 1,
        }),
      ),
    ).toMatchObject({ codigo: 'SEDE_ARCHIVADA', status: 422 });
  });

  it('rechaza un código repetido dentro de la sede', async () => {
    const e = entorno(bloque());
    expect(
      await rechazo(
        e.servicio.crear({
          sedeId: OTRO_ID,
          codigo: 'A',
          nombre: 'A',
          numeroPisos: 2,
        }),
      ),
    ).toMatchObject({ codigo: 'CODIGO_REGISTRADO', status: 409 });
  });

  it('crea el bloque en una sede activa', async () => {
    const e = entorno(null);
    await e.servicio.crear({
      sedeId: OTRO_ID,
      codigo: 'D',
      nombre: ' Bloque D ',
      numeroPisos: 2,
    });
    expect(e.prisma.bloque.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          codigo: 'D',
          nombre: 'Bloque D',
          numeroPisos: 2,
        }),
      }),
    );
  });

  it('no reduce los pisos por debajo de un espacio existente', async () => {
    const e = entorno();
    e.prisma.espacio.count.mockResolvedValue(2);
    expect(
      await rechazo(e.servicio.actualizar(ID, { numeroPisos: 1 })),
    ).toMatchObject({
      codigo: 'PISOS_CON_ESPACIOS',
      status: 422,
    });
    expect(e.prisma.bloque.update).not.toHaveBeenCalled();
  });

  it('no archiva un bloque con espacios activos', async () => {
    const e = entorno(bloque({ _count: { espacios: 4 } }));
    expect(await rechazo(e.servicio.archivar(ID))).toMatchObject({
      codigo: 'BLOQUE_CON_ESPACIOS',
      status: 409,
    });
  });

  it('no restaura un bloque cuya sede está archivada', async () => {
    const e = entorno(bloque({ activo: false, sede: { activa: false } }));
    expect(await rechazo(e.servicio.restaurar(ID))).toMatchObject({
      codigo: 'SEDE_ARCHIVADA',
      status: 422,
    });
  });
});

describe('TiposEspacioAdminService', () => {
  function entorno(actual: unknown = tipo()) {
    const prisma = {
      tipoEspacio: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([tipo()]),
        findUnique: vi.fn().mockResolvedValue(actual),
        create: vi.fn().mockResolvedValue(tipo()),
        update: vi.fn().mockResolvedValue(tipo({ activo: false })),
      },
    };
    return {
      servicio: new TiposEspacioAdminService(comoPrisma(prisma)),
      prisma,
    };
  }

  it('crea un tipo con sus reglas de anticipación y póliza', async () => {
    const e = entorno(null);
    await e.servicio.crear({
      codigo: 'AUDITORIO',
      nombre: 'Auditorio',
      anticipacionMinimaDias: 7,
      anticipacionEnHabiles: false,
      aforoExigePoliza: 200,
    });
    expect(e.prisma.tipoEspacio.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          codigo: 'AUDITORIO',
          anticipacionMinimaDias: 7,
          anticipacionEnHabiles: false,
          aforoExigePoliza: 200,
        }),
      }),
    );
  });

  it('rechaza un código repetido', async () => {
    const e = entorno(tipo());
    expect(
      await rechazo(e.servicio.crear({ codigo: 'AULA', nombre: 'Otra' })),
    ).toMatchObject({
      codigo: 'CODIGO_REGISTRADO',
      status: 409,
    });
  });

  it('permite quitar la exigencia de póliza con null', async () => {
    const e = entorno();
    await e.servicio.actualizar(ID, { aforoExigePoliza: null });
    expect(e.prisma.tipoEspacio.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { aforoExigePoliza: null } }),
    );
  });

  it('no archiva un tipo con espacios activos', async () => {
    const e = entorno(tipo({ _count: { espacios: 3 } }));
    expect(await rechazo(e.servicio.archivar(ID))).toMatchObject({
      codigo: 'TIPO_CON_ESPACIOS',
      status: 409,
    });
    expect(e.prisma.tipoEspacio.update).not.toHaveBeenCalled();
  });
});

describe('ElementosAdminService', () => {
  function entorno(
    actual: unknown = elemento(),
    espacio: unknown = { archivadoEn: null },
    placaOtro: unknown = null,
  ) {
    const prisma = {
      espacio: { findUnique: vi.fn().mockResolvedValue(espacio) },
      elemento: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([elemento()]),
        findUnique: vi.fn(
          (args: { where: { id?: string; placaInventario?: string } }) =>
            Promise.resolve(args.where.placaInventario ? placaOtro : actual),
        ),
        create: vi.fn().mockResolvedValue(elemento()),
        update: vi
          .fn()
          .mockResolvedValue(
            elemento({ estado: 'DADO_DE_BAJA', esPrestable: false }),
          ),
      },
    };
    return { servicio: new ElementosAdminService(comoPrisma(prisma)), prisma };
  }

  it('lista con filtros de espacio y estado y devuelve la fecha como AAAA-MM-DD', async () => {
    const e = entorno();
    const r = await e.servicio.listar({
      espacioId: OTRO_ID,
      estado: 'EN_SERVICIO',
      pagina: 1,
      porPagina: 50,
    });
    expect(e.prisma.elemento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { espacioId: OTRO_ID, estado: 'EN_SERVICIO' },
      }),
    );
    expect(r.datos[0]).toMatchObject({
      espacioCodigo: 'A-101',
      fechaAdquisicion: '2024-03-15',
    });
  });

  it('crea un elemento en un espacio activo', async () => {
    const e = entorno();
    await e.servicio.crear({
      espacioId: OTRO_ID,
      nombre: ' Videobeam ',
      placaInventario: 'ITP-9',
      cantidad: 2,
    });
    expect(e.prisma.elemento.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nombre: 'Videobeam',
          placaInventario: 'ITP-9',
          cantidad: 2,
        }),
      }),
    );
  });

  it('no crea elementos en un espacio archivado ni inexistente', async () => {
    const archivado = entorno(elemento(), { archivadoEn: new Date() });
    expect(
      await rechazo(
        archivado.servicio.crear({ espacioId: OTRO_ID, nombre: 'X' }),
      ),
    ).toMatchObject({
      codigo: 'ESPACIO_ARCHIVADO',
      status: 422,
    });
    const inexistente = entorno(elemento(), null);
    expect(
      await rechazo(
        inexistente.servicio.crear({ espacioId: OTRO_ID, nombre: 'X' }),
      ),
    ).toMatchObject({
      status: 404,
    });
  });

  it('rechaza una placa de inventario repetida con 409', async () => {
    const e = entorno(elemento(), { archivadoEn: null }, { id: OTRO_ID });
    expect(
      await rechazo(
        e.servicio.crear({
          espacioId: OTRO_ID,
          nombre: 'X',
          placaInventario: 'ITP-1',
        }),
      ),
    ).toMatchObject({ codigo: 'PLACA_REGISTRADA', status: 409 });
    expect(e.prisma.elemento.create).not.toHaveBeenCalled();
  });

  it('traslada el elemento a otro espacio y conserva su placa sin revalidarla', async () => {
    const e = entorno();
    await e.servicio.actualizar(ID, {
      espacioId: OTRO_ID,
      placaInventario: 'ITP-1',
    });
    expect(e.prisma.elemento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { espacioId: OTRO_ID, placaInventario: 'ITP-1' },
      }),
    );
  });

  it('dar de baja cambia el estado, quita el préstamo y es idempotente', async () => {
    const e = entorno();
    await e.servicio.darDeBaja(ID);
    expect(e.prisma.elemento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { estado: 'DADO_DE_BAJA', esPrestable: false },
      }),
    );

    const ya = entorno(elemento({ estado: 'DADO_DE_BAJA' }));
    await ya.servicio.darDeBaja(ID);
    expect(ya.prisma.elemento.update).not.toHaveBeenCalled();
  });
});

describe('EspaciosAdminService.actualizar', () => {
  const espacioActual = {
    id: ID,
    codigo: 'A-101',
    piso: 1,
    bloque: {
      codigo: 'A',
      nombre: 'Bloque A',
      numeroPisos: 3,
      sede: { codigo: 'MOC', nombre: 'Mocoa' },
    },
    tipo: { id: OTRO_ID, codigo: 'AULA', nombre: 'Aula' },
  };

  function entorno(actual: unknown = espacioActual) {
    const prisma = {
      espacio: {
        findFirst: vi.fn().mockResolvedValue(actual),
        update: vi.fn((args: { data: Record<string, unknown> }) =>
          Promise.resolve({
            codigo: 'A-101',
            nombre: 'Aula 101',
            piso: 1,
            capacidadPersonas: 40,
            ...args.data,
          }),
        ),
      },
      tipoEspacio: {
        findUnique: vi
          .fn()
          .mockResolvedValue({
            id: ID,
            codigo: 'LABORATORIO',
            nombre: 'Laboratorio',
          }),
      },
      dependencia: { findUnique: vi.fn().mockResolvedValue({ id: ID }) },
      usuario: { findFirst: vi.fn().mockResolvedValue({ id: ID }) },
    };
    return { servicio: new EspaciosAdminService(comoPrisma(prisma)), prisma };
  }

  it('cambia solo los campos enviados', async () => {
    const e = entorno();
    const r = await e.servicio.actualizar('a-101', {
      capacidadPersonas: 45,
      estado: 'EN_MANTENIMIENTO',
    });
    expect(e.prisma.espacio.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { codigo: 'A-101', archivadoEn: null },
      }),
    );
    expect(e.prisma.espacio.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { capacidadPersonas: 45, estado: 'EN_MANTENIMIENTO' },
      }),
    );
    expect(r.sede.codigo).toBe('MOC');
  });

  it('cambia el tipo por su código', async () => {
    const e = entorno();
    const r = await e.servicio.actualizar('A-101', { tipo: 'laboratorio' });
    expect(e.prisma.tipoEspacio.findUnique).toHaveBeenCalledWith({
      where: { codigo: 'LABORATORIO' },
    });
    expect(r.tipo.codigo).toBe('LABORATORIO');
  });

  it('rechaza un piso que el bloque no tiene', async () => {
    const e = entorno();
    expect(
      await rechazo(e.servicio.actualizar('A-101', { piso: 4 })),
    ).toMatchObject({
      codigo: 'PISO_INVALIDO',
      status: 422,
    });
    expect(e.prisma.espacio.update).not.toHaveBeenCalled();
  });

  it('rechaza un responsable inactivo y una dependencia inexistente', async () => {
    const e = entorno();
    e.prisma.usuario.findFirst.mockResolvedValue(null);
    expect(
      await rechazo(e.servicio.actualizar('A-101', { responsableId: OTRO_ID })),
    ).toMatchObject({
      codigo: 'RESPONSABLE_NO_VALIDO',
      status: 422,
    });
    e.prisma.dependencia.findUnique.mockResolvedValue(null);
    expect(
      await rechazo(e.servicio.actualizar('A-101', { dependencia: 'NADA' })),
    ).toMatchObject({
      codigo: 'DEPENDENCIA_NO_ENCONTRADA',
      status: 404,
    });
  });

  it('quita la dependencia con null y responde 404 si el espacio no existe o está archivado', async () => {
    const e = entorno();
    await e.servicio.actualizar('A-101', { dependencia: null });
    expect(e.prisma.espacio.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { dependenciaId: null } }),
    );
    const ninguno = entorno(null);
    expect(
      await rechazo(ninguno.servicio.actualizar('Z-9', { nombre: 'X' })),
    ).toMatchObject({ status: 404 });
  });
});
