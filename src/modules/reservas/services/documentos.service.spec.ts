import { describe, expect, it, vi } from 'vitest';
import type { AlmacenamientoPort } from '../../../shared/almacenamiento/almacenamiento.port.js';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { DocumentosService, MAXIMO_DOCUMENTOS_POR_SOLICITUD, TAMANO_MAXIMO_BYTES } from './documentos.service.js';
import type { SolicitudesService } from './solicitudes.service.js';

const SOLICITUD_ID = '6e1d8c1e-6a4d-4e0b-9a57-1c2d3e4f5a6b';
const usuario: UsuarioAutenticado = {
  id: 'u-1',
  correo: 'ana@ejemplo.com',
  roles: ['SOLICITANTE'],
  dependencias: [],
  correoVerificado: true,
  esInstitucional: false,
};

const PDF = Buffer.from('%PDF-1.7\ncontenido');
const archivo = (cambios: Record<string, unknown> = {}) => ({
  originalname: 'poliza.pdf',
  size: PDF.length,
  buffer: PDF,
  ...cambios,
});

function crearEntorno() {
  const prisma = {
    $transaction: vi.fn(),
    solicitud: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    documentoAdjunto: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'd-1', creadoEn: new Date('2026-10-21T15:00:00.000Z'), ...args.data }),
      ),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({ id: 'd-1', url: 'solicitudes/s/d.pdf', nombre: 'poliza.pdf' }),
      delete: vi.fn().mockResolvedValue({}),
    },
  };
  prisma.$transaction.mockImplementation((fn: (cliente: typeof prisma) => unknown) => fn(prisma));
  const solicitudes = {
    borradorPropio: vi.fn().mockResolvedValue({ id: SOLICITUD_ID }),
    asegurarVisible: vi.fn().mockResolvedValue(undefined),
  };
  const almacenamiento = {
    guardar: vi.fn().mockResolvedValue(undefined),
    leer: vi.fn().mockResolvedValue(PDF),
    eliminar: vi.fn().mockResolvedValue(undefined),
  };
  const servicio = new DocumentosService(
    prisma as unknown as PrismaService,
    solicitudes as unknown as SolicitudesService,
    almacenamiento as unknown as AlmacenamientoPort,
  );
  return { servicio, prisma, solicitudes, almacenamiento };
}

const rechazo = (promesa: Promise<unknown>): Promise<unknown> => promesa.catch((e: unknown) => e);

describe('DocumentosService.subir', () => {
  it('guarda el archivo con una clave del servidor y registra el documento', async () => {
    const e = crearEntorno();
    const r = await e.servicio.subir(SOLICITUD_ID, 'POLIZA', archivo({ originalname: '../../poliza.pdf' }), usuario);

    expect(e.solicitudes.borradorPropio).toHaveBeenCalledWith(SOLICITUD_ID, usuario);
    const [clave, contenido, tipoMime] = e.almacenamiento.guardar.mock.calls[0] as [string, Buffer, string];
    expect(clave).toMatch(new RegExp(`^solicitudes/${SOLICITUD_ID}/[0-9a-f-]{36}\\.pdf$`));
    expect(contenido).toBe(PDF);
    expect(tipoMime).toBe('application/pdf');
    expect(e.prisma.documentoAdjunto.create).toHaveBeenCalledWith({
      data: { solicitudId: SOLICITUD_ID, tipo: 'POLIZA', nombre: 'poliza.pdf', url: clave, tamanoBytes: PDF.length },
    });
    expect(r).toEqual({
      id: 'd-1',
      tipo: 'POLIZA',
      nombre: 'poliza.pdf',
      tamanoBytes: PDF.length,
      creadoEn: '2026-10-21T15:00:00.000Z',
    });
    expect(r).not.toHaveProperty('url');
  });

  it('un contenido que no es PDF, PNG ni JPG da 422 aunque se llame .pdf', async () => {
    const e = crearEntorno();
    const falso = Buffer.from('<html>no soy un pdf</html>');
    const error = await rechazo(
      e.servicio.subir(SOLICITUD_ID, 'OTRO', archivo({ buffer: falso, size: falso.length }), usuario),
    );
    expect(error).toMatchObject({ codigo: 'ARCHIVO_NO_PERMITIDO', status: 422 });
    expect(e.almacenamiento.guardar).not.toHaveBeenCalled();
  });

  it.each([
    ['sin archivo', undefined, 'ARCHIVO_REQUERIDO'],
    ['vacío', archivo({ size: 0, buffer: Buffer.alloc(0) }), 'ARCHIVO_REQUERIDO'],
    ['de más de 10 MB', archivo({ size: TAMANO_MAXIMO_BYTES + 1 }), 'ARCHIVO_MUY_GRANDE'],
  ])('un archivo %s da 422 %s', async (_caso, subido, codigo) => {
    const e = crearEntorno();
    const error = await rechazo(e.servicio.subir(SOLICITUD_ID, 'OTRO', subido, usuario));
    expect(error).toMatchObject({ codigo, status: 422 });
  });

  it('con el máximo de documentos da 422 LIMITE_DE_ITEMS', async () => {
    const e = crearEntorno();
    e.prisma.documentoAdjunto.count.mockResolvedValue(MAXIMO_DOCUMENTOS_POR_SOLICITUD);
    const error = await rechazo(e.servicio.subir(SOLICITUD_ID, 'OTRO', archivo(), usuario));
    expect(error).toMatchObject({ codigo: 'LIMITE_DE_ITEMS', status: 422 });
  });

  it('si falla el registro en base de datos, borra el archivo guardado', async () => {
    const e = crearEntorno();
    e.prisma.documentoAdjunto.create.mockRejectedValueOnce(new Error('base caída'));
    await expect(e.servicio.subir(SOLICITUD_ID, 'OTRO', archivo(), usuario)).rejects.toThrow('base caída');
    const clave = e.almacenamiento.guardar.mock.calls[0]![0] as string;
    expect(e.almacenamiento.eliminar).toHaveBeenCalledWith(clave);
  });
});

describe('DocumentosService concurrencia con el envío', () => {
  it('subir un documento cuando la solicitud ya no es borrador da 409 y borra el archivo guardado', async () => {
    const e = crearEntorno();
    e.prisma.solicitud.updateMany.mockResolvedValue({ count: 0 });
    const error = await rechazo(e.servicio.subir(SOLICITUD_ID, 'POLIZA', archivo(), usuario));

    expect(error).toMatchObject({ codigo: 'SOLICITUD_NO_EDITABLE', status: 409 });
    expect(e.prisma.documentoAdjunto.create).not.toHaveBeenCalled();
    const clave = e.almacenamiento.guardar.mock.calls[0]![0] as string;
    expect(e.almacenamiento.eliminar).toHaveBeenCalledWith(clave);
  });

  it('quitar un documento cuando la solicitud ya no es borrador da 409 y no borra nada', async () => {
    const e = crearEntorno();
    e.prisma.solicitud.updateMany.mockResolvedValue({ count: 0 });
    const error = await rechazo(e.servicio.eliminar(SOLICITUD_ID, 'd-1', usuario));
    expect(error).toMatchObject({ codigo: 'SOLICITUD_NO_EDITABLE', status: 409 });
    expect(e.prisma.documentoAdjunto.delete).not.toHaveBeenCalled();
    expect(e.almacenamiento.eliminar).not.toHaveBeenCalled();
  });
});

describe('DocumentosService lectura y borrado', () => {
  it('listar exige que la solicitud sea visible', async () => {
    const e = crearEntorno();
    e.prisma.documentoAdjunto.findMany.mockResolvedValue([
      { id: 'd-1', tipo: 'RUT', nombre: 'rut.pdf', tamanoBytes: 10, creadoEn: new Date('2026-10-21T15:00:00.000Z') },
    ]);
    const lista = await e.servicio.listar(SOLICITUD_ID, usuario);
    expect(e.solicitudes.asegurarVisible).toHaveBeenCalledWith(SOLICITUD_ID, usuario);
    expect(lista).toEqual([
      { id: 'd-1', tipo: 'RUT', nombre: 'rut.pdf', tamanoBytes: 10, creadoEn: '2026-10-21T15:00:00.000Z' },
    ]);
  });

  it('descargar devuelve el contenido con el tipo detectado', async () => {
    const e = crearEntorno();
    const r = await e.servicio.descargar(SOLICITUD_ID, 'd-1', usuario);
    expect(r).toEqual({ contenido: PDF, tipoMime: 'application/pdf', nombre: 'poliza.pdf' });
  });

  it('descargar un documento inexistente o sin archivo da 404', async () => {
    const e = crearEntorno();
    e.prisma.documentoAdjunto.findFirst.mockResolvedValue(null);
    await expect(rechazo(e.servicio.descargar(SOLICITUD_ID, 'x', usuario))).resolves.toMatchObject({
      codigo: 'NO_ENCONTRADO',
      status: 404,
    });

    const otro = crearEntorno();
    otro.almacenamiento.leer.mockResolvedValue(null);
    await expect(rechazo(otro.servicio.descargar(SOLICITUD_ID, 'd-1', usuario))).resolves.toMatchObject({
      codigo: 'NO_ENCONTRADO',
    });
  });

  it('eliminar quita el registro y el archivo, solo en borrador propio', async () => {
    const e = crearEntorno();
    await e.servicio.eliminar(SOLICITUD_ID, 'd-1', usuario);
    expect(e.solicitudes.borradorPropio).toHaveBeenCalledWith(SOLICITUD_ID, usuario);
    expect(e.prisma.documentoAdjunto.delete).toHaveBeenCalledWith({ where: { id: 'd-1' } });
    expect(e.almacenamiento.eliminar).toHaveBeenCalledWith('solicitudes/s/d.pdf');
  });

  it('eliminar un documento ajeno a la solicitud da 404 sin tocar nada', async () => {
    const e = crearEntorno();
    e.prisma.documentoAdjunto.findFirst.mockResolvedValue(null);
    const error = await rechazo(e.servicio.eliminar(SOLICITUD_ID, 'x', usuario));
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
    expect(e.prisma.documentoAdjunto.delete).not.toHaveBeenCalled();
  });
});
