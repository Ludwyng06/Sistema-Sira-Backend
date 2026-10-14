import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { ParametroService } from './parametro.service.js';

const findUnique = vi.fn<
  (args: { where: { clave: string }; select: { valor: true } }) => Promise<{ valor: unknown } | null>
>();

function crearServicio(): ParametroService {
  const prisma = { parametro: { findUnique } } as unknown as PrismaService;
  return new ParametroService(prisma);
}

describe('ParametroService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devuelve el valor numérico', async () => {
    findUnique.mockResolvedValue({ valor: 15 });

    await expect(crearServicio().obtenerNumero('minutos_vigencia_codigo')).resolves.toBe(15);
    expect(findUnique).toHaveBeenCalledOnce();
  });

  it('devuelve el texto', async () => {
    findUnique.mockResolvedValue({ valor: '2026-10' });

    await expect(crearServicio().obtenerTexto('version_politica_datos')).resolves.toBe('2026-10');
  });

  it('devuelve la lista de textos', async () => {
    findUnique.mockResolvedValue({ valor: ['itp.edu.co', 'uniputumayo.edu.co'] });

    await expect(crearServicio().obtenerListaTexto('dominios_institucionales')).resolves.toEqual([
      'itp.edu.co',
      'uniputumayo.edu.co',
    ]);
  });

  it.each([
    ['obtenerNumero', 'parametro_numero'],
    ['obtenerTexto', 'parametro_texto'],
    ['obtenerListaTexto', 'parametro_lista'],
  ] as const)('%s falla e identifica la clave cuando no existe', async (metodo, clave) => {
    findUnique.mockResolvedValue(null);
    const servicio = crearServicio();
    const resultado =
      metodo === 'obtenerNumero'
        ? servicio.obtenerNumero(clave)
        : metodo === 'obtenerTexto'
          ? servicio.obtenerTexto(clave)
          : servicio.obtenerListaTexto(clave);

    await expect(resultado).rejects.toThrow(clave);
  });

  it.each([
    ['obtenerNumero', 'parametro_numero', '15'],
    ['obtenerTexto', 'parametro_texto', 15],
    ['obtenerListaTexto', 'parametro_lista', ['texto', 2]],
  ] as const)('%s falla e identifica la clave si el tipo no corresponde', async (metodo, clave, valor) => {
    findUnique.mockResolvedValue({ valor });
    const servicio = crearServicio();
    const resultado =
      metodo === 'obtenerNumero'
        ? servicio.obtenerNumero(clave)
        : metodo === 'obtenerTexto'
          ? servicio.obtenerTexto(clave)
          : servicio.obtenerListaTexto(clave);

    await expect(resultado).rejects.toThrow(clave);
  });

  it('rechaza números no finitos', async () => {
    findUnique.mockResolvedValue({ valor: Number.POSITIVE_INFINITY });

    await expect(crearServicio().obtenerNumero('limite')).rejects.toThrow('limite');
  });
});
