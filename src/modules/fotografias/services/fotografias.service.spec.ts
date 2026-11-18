import sharp from 'sharp';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { AlmacenamientoPort } from '../../../shared/almacenamiento/almacenamiento.port.js';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ANCHO_VARIANTE, FotografiasService, MAXIMO_FOTOS_POR_ESPACIO } from './fotografias.service.js';

const ESPACIO_ID = '8a3b8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';

const administrador: UsuarioAutenticado = {
  id: 'u-adm',
  correo: 'admin@itp.edu.co',
  roles: ['ADMINISTRADOR'],
  dependencias: [],
  correoVerificado: true,
  esInstitucional: true,
};
const responsable: UsuarioAutenticado = { ...administrador, id: 'u-resp', roles: ['RESPONSABLE_ESPACIO'] };

let png: Buffer;
let pequena: Buffer;

beforeAll(async () => {
  png = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#336699' } })
    .png()
    .toBuffer();
  pequena = await sharp({ create: { width: 100, height: 60, channels: 3, background: '#ffffff' } })
    .jpeg()
    .toBuffer();
});

function crearEntorno(
  opciones: { espacio?: unknown; existentes?: number; existentesEnTransaccion?: number } = {},
) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    fotografia: {
      count: vi.fn().mockResolvedValue(opciones.existentesEnTransaccion ?? opciones.existentes ?? 0),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ ...args.data })),
      delete: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue({ id: 'sig-1' }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    espacio: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          opciones.espacio === undefined ? { id: ESPACIO_ID, responsableId: 'u-resp' } : opciones.espacio,
        ),
    },
    fotografia: {
      count: vi.fn().mockResolvedValue(opciones.existentes ?? 0),
      findUnique: vi.fn().mockResolvedValue({ espacioId: ESPACIO_ID }),
      findFirst: vi.fn().mockResolvedValue({ id: 'foto-1', esPortada: false }),
    },
    $transaction: vi.fn((fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const guardado = new Map<string, Buffer>();
  const almacenamiento = {
    guardar: vi.fn((clave: string, contenido: Buffer) => {
      guardado.set(clave, contenido);
      return Promise.resolve();
    }),
    leer: vi.fn((clave: string) => Promise.resolve(guardado.get(clave) ?? null)),
    eliminar: vi.fn().mockResolvedValue(undefined),
  };
  const servicio = new FotografiasService(
    prisma as unknown as PrismaService,
    almacenamiento as unknown as AlmacenamientoPort,
  );
  return { servicio, prisma, tx, almacenamiento, guardado };
}

const rechazo = (promesa: Promise<unknown>): Promise<unknown> => promesa.catch((e: unknown) => e);

describe('FotografiasService.subir', () => {
  it('genera tres variantes WebP sin agrandar, guarda las URL públicas y deja la primera como portada', async () => {
    const e = crearEntorno();
    const foto = await e.servicio.subir(
      ESPACIO_ID,
      { textoAlternativo: ' Vista frontal del aula. ' } as never,
      { size: png.length, buffer: png },
      administrador,
    );

    expect(e.guardado.size).toBe(3);
    const anchos: Record<string, number> = {};
    for (const [clave, contenido] of e.guardado) {
      const meta = await sharp(contenido).metadata();
      expect(meta.format).toBe('webp');
      anchos[clave.split('-').pop()!.replace('.webp', '')] = meta.width ?? 0;
    }
    expect(anchos).toEqual({
      detalle: ANCHO_VARIANTE.detalle,
      tarjeta: ANCHO_VARIANTE.tarjeta,
      miniatura: ANCHO_VARIANTE.miniatura,
    });

    expect(foto).toMatchObject({
      textoAlternativo: 'Vista frontal del aula.',
      esPortada: true,
      orden: 0,
    });
    expect(foto.urlTarjeta).toBe(`/api/fotos/${foto.id}/tarjeta`);
    expect([...e.guardado.keys()].every((k) => k.startsWith(`espacios/${ESPACIO_ID}/${foto.id}-`))).toBe(true);
  });

  it('toma un candado sobre el espacio y vuelve a contar dentro de la transacción (carrera de dos subidas)', async () => {
    const e = crearEntorno({ existentes: MAXIMO_FOTOS_POR_ESPACIO - 1, existentesEnTransaccion: MAXIMO_FOTOS_POR_ESPACIO });
    const error = await e.servicio
      .subir(
        ESPACIO_ID,
        { textoAlternativo: 'Otra' } as never,
        { size: png.length, buffer: png },
        administrador,
      )
      .catch((err: unknown) => err);

    expect(e.tx.$queryRaw).toHaveBeenCalledOnce();
    expect(error).toMatchObject({ codigo: 'LIMITE_DE_ITEMS', status: 422 });
    expect(e.tx.fotografia.create).not.toHaveBeenCalled();
    expect(e.almacenamiento.eliminar).toHaveBeenCalledTimes(3);
  });

  it('una imagen pequeña no se agranda', async () => {
    const e = crearEntorno();
    await e.servicio.subir(
      ESPACIO_ID,
      { textoAlternativo: 'Pequeña' } as never,
      { size: pequena.length, buffer: pequena },
      administrador,
    );
    for (const contenido of e.guardado.values()) {
      expect((await sharp(contenido).metadata()).width).toBeLessThanOrEqual(100);
    }
  });

  it('la segunda foto no es portada salvo que se indique, y la nueva portada reemplaza a la anterior', async () => {
    const e = crearEntorno({ existentes: 2 });
    const segunda = await e.servicio.subir(
      ESPACIO_ID,
      { textoAlternativo: 'Otra' } as never,
      { size: png.length, buffer: png },
      administrador,
    );
    expect(segunda).toMatchObject({ esPortada: false, orden: 2 });
    expect(e.tx.fotografia.updateMany).not.toHaveBeenCalled();

    const portada = await e.servicio.subir(
      ESPACIO_ID,
      { textoAlternativo: 'Nueva portada', esPortada: true } as never,
      { size: png.length, buffer: png },
      administrador,
    );
    expect(portada.esPortada).toBe(true);
    expect(e.tx.fotografia.updateMany).toHaveBeenCalledWith({
      where: { espacioId: ESPACIO_ID, esPortada: true },
      data: { esPortada: false },
    });
  });

  it('el responsable del espacio sube; otro responsable o un solicitante reciben 404', async () => {
    const propio = crearEntorno();
    await expect(
      propio.servicio.subir(
        ESPACIO_ID,
        { textoAlternativo: 'x' } as never,
        { size: png.length, buffer: png },
        responsable,
      ),
    ).resolves.toMatchObject({ esPortada: true });

    const ajeno = crearEntorno();
    await expect(
      ajeno.servicio.subir(
        ESPACIO_ID,
        { textoAlternativo: 'x' } as never,
        { size: png.length, buffer: png },
        { ...responsable, id: 'u-otro' },
      ),
    ).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });

    const solicitante = crearEntorno();
    await expect(
      solicitante.servicio.subir(
        ESPACIO_ID,
        { textoAlternativo: 'x' } as never,
        { size: png.length, buffer: png },
        { ...administrador, roles: ['SOLICITANTE'] },
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it.each([
    ['sin archivo', undefined, 'ARCHIVO_REQUERIDO'],
    ['de más de 10 MB', { size: 10 * 1024 * 1024 + 1, buffer: Buffer.alloc(10) }, 'ARCHIVO_MUY_GRANDE'],
    ['que es un PDF', { size: 20, buffer: Buffer.from('%PDF-1.7 contenido') }, 'ARCHIVO_NO_PERMITIDO'],
    [
      'con cabecera JPG pero dañado',
      { size: 20, buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02]) },
      'ARCHIVO_NO_PERMITIDO',
    ],
  ])('un archivo %s da 422 %s', async (_caso, archivo, codigo) => {
    const e = crearEntorno();
    const error = await rechazo(
      e.servicio.subir(ESPACIO_ID, { textoAlternativo: 'x' } as never, archivo, administrador),
    );
    expect(error).toMatchObject({ codigo, status: 422 });
    expect(e.almacenamiento.guardar).not.toHaveBeenCalled();
  });

  it('con el máximo de fotos da 422 LIMITE_DE_ITEMS', async () => {
    const e = crearEntorno({ existentes: MAXIMO_FOTOS_POR_ESPACIO });
    const error = await rechazo(
      e.servicio.subir(
        ESPACIO_ID,
        { textoAlternativo: 'x' } as never,
        { size: png.length, buffer: png },
        administrador,
      ),
    );
    expect(error).toMatchObject({ codigo: 'LIMITE_DE_ITEMS', status: 422 });
  });

  it('si falla la base de datos, borra las variantes ya guardadas', async () => {
    const e = crearEntorno();
    e.prisma.$transaction.mockRejectedValueOnce(new Error('base caída'));
    await expect(
      e.servicio.subir(
        ESPACIO_ID,
        { textoAlternativo: 'x' } as never,
        { size: png.length, buffer: png },
        administrador,
      ),
    ).rejects.toThrow('base caída');
    expect(e.almacenamiento.eliminar).toHaveBeenCalledTimes(3);
  });
});

describe('FotografiasService servir y eliminar', () => {
  it('sirve una variante guardada y responde 404 si no existe', async () => {
    const e = crearEntorno();
    e.guardado.set(`espacios/${ESPACIO_ID}/foto-1-tarjeta.webp`, Buffer.from('webp'));
    await expect(e.servicio.servir('foto-1', 'tarjeta')).resolves.toEqual({ contenido: Buffer.from('webp') });
    await expect(e.servicio.servir('foto-1', 'detalle')).rejects.toMatchObject({ status: 404 });

    e.prisma.fotografia.findUnique.mockResolvedValue(null);
    await expect(e.servicio.servir('x', 'tarjeta')).rejects.toMatchObject({ status: 404 });
  });

  it('eliminar quita el registro y las tres variantes, y reasigna la portada', async () => {
    const e = crearEntorno();
    e.prisma.fotografia.findFirst.mockResolvedValue({ id: 'foto-1', esPortada: true });
    await e.servicio.eliminar(ESPACIO_ID, 'foto-1', administrador);

    expect(e.tx.fotografia.delete).toHaveBeenCalledWith({ where: { id: 'foto-1' } });
    expect(e.tx.fotografia.update).toHaveBeenCalledWith({ where: { id: 'sig-1' }, data: { esPortada: true } });
    expect(e.almacenamiento.eliminar).toHaveBeenCalledTimes(3);
  });

  it('eliminar una foto ajena al espacio da 404 sin borrar nada', async () => {
    const e = crearEntorno();
    e.prisma.fotografia.findFirst.mockResolvedValue(null);
    await expect(e.servicio.eliminar(ESPACIO_ID, 'x', administrador)).rejects.toMatchObject({ status: 404 });
    expect(e.tx.fotografia.delete).not.toHaveBeenCalled();
    expect(e.almacenamiento.eliminar).not.toHaveBeenCalled();
  });
});
