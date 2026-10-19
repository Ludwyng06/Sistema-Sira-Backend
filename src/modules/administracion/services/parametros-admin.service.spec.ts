import { describe, expect, it, vi } from 'vitest';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { conservaForma, ParametrosAdminService } from './parametros-admin.service.js';

const CONTEXTO = { ip: '10.0.0.1', userAgent: 'vitest', correlacionId: 'corr-1' };
const admin: UsuarioAutenticado = {
  id: 'u-admin',
  correo: 'admin@itp.edu.co',
  roles: ['ADMINISTRADOR'],
  dependencias: [],
  correoVerificado: true,
  esInstitucional: true,
};

const ACTUALIZADO = new Date('2026-10-22T15:00:00.000Z');

function crearEntorno(actual: unknown) {
  const tx = {
    parametro: {
      update: vi.fn((args: { where: { clave: string }; data: { valor: unknown } }) =>
        Promise.resolve({
          clave: args.where.clave,
          valor: args.data.valor,
          descripcion: 'd',
          actualizadoEn: ACTUALIZADO,
        }),
      ),
    },
    bitacora: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    parametro: {
      findMany: vi.fn().mockResolvedValue([
        { clave: 'a', valor: 1, descripcion: null, actualizadoEn: ACTUALIZADO },
      ]),
      findUnique: vi.fn().mockResolvedValue(actual),
    },
    $transaction: vi.fn((fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { servicio: new ParametrosAdminService(prisma as unknown as PrismaService), prisma, tx };
}

const existente = (clave: string, valor: unknown) => ({ clave, valor, descripcion: 'd', actualizadoEn: ACTUALIZADO });
const rechazo = (promesa: Promise<unknown>): Promise<unknown> => promesa.catch((e: unknown) => e);

describe('conservaForma', () => {
  it.each([
    [72, 48, true],
    [72, '48', false],
    [72, -1, false],
    [72, Number.NaN, false],
    ['2026-10', '2027-01', true],
    ['2026-10', 5, false],
    [['a.co', 'b.co'], ['c.co'], true],
    [['a.co'], ['c.co', 5], false],
    [['a.co'], [], true],
    [[], ['x', 1], true],
    [{ banco: 'x', tipo: 'y' }, { banco: 'a', tipo: 'b' }, true],
    [{ banco: 'x', tipo: 'y' }, { banco: 'a' }, false],
    [{ banco: 'x', tipo: 'y' }, { banco: 'a', tipo: 'b', otro: 'c' }, false],
    [{ banco: 'x' }, { banco: 5 }, false],
    [[{ d: 1, p: 100 }], [{ d: 2, p: 50 }, { d: 0, p: 0 }], true],
    [[{ d: 1, p: 100 }], [{ d: 2 }], false],
    [true, false, true],
    [true, 'no', false],
    [72, null, false],
    [null, 5, false],
  ])('%j → %j: %s', (actual, nuevo, esperado) => {
    expect(conservaForma(actual, nuevo)).toBe(esperado);
  });
});

describe('ParametrosAdminService', () => {
  it('lista los parámetros', async () => {
    const e = crearEntorno(null);
    await expect(e.servicio.listar()).resolves.toEqual([
      { clave: 'a', valor: 1, descripcion: null, actualizadoEn: '2026-10-22T15:00:00.000Z' },
    ]);
  });

  it('actualiza un número, deja el valor anterior en la bitácora y devuelve el nuevo', async () => {
    const e = crearEntorno(existente('horas_plazo_revision', 72));
    const r = await e.servicio.actualizar('horas_plazo_revision', 48, admin, CONTEXTO);

    expect(r).toMatchObject({ clave: 'horas_plazo_revision', valor: 48 });
    expect(e.tx.bitacora.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accion: 'PARAMETRO_ACTUALIZADO',
        entidad: 'Parametro',
        entidadId: 'horas_plazo_revision',
        datosAntes: { valor: 72 },
        datosDespues: { valor: 48 },
        usuarioId: 'u-admin',
        correlacionId: 'corr-1',
      }),
    });
  });

  it('rechaza una clave inexistente con 404', async () => {
    const e = crearEntorno(null);
    const error = await rechazo(e.servicio.actualizar('no_existe', 1, admin, CONTEXTO));
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
  });

  it('rechaza un valor de otro tipo con 422 PARAMETRO_INVALIDO', async () => {
    const e = crearEntorno(existente('horas_plazo_revision', 72));
    const error = await rechazo(e.servicio.actualizar('horas_plazo_revision', 'muchas', admin, CONTEXTO));
    expect(error).toMatchObject({
      codigo: 'PARAMETRO_INVALIDO',
      status: 422,
      detalles: { clave: 'horas_plazo_revision' },
    });
    expect(e.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('valida la lista de dominios institucionales', async () => {
    const e = crearEntorno(existente('dominios_institucionales', ['itp.edu.co']));
    await expect(
      e.servicio.actualizar('dominios_institucionales', ['itp.edu.co', 'uniputumayo.edu.co'], admin, CONTEXTO),
    ).resolves.toBeDefined();
    await expect(
      rechazo(e.servicio.actualizar('dominios_institucionales', ['itp.edu.co', 5], admin, CONTEXTO)),
    ).resolves.toMatchObject({ codigo: 'PARAMETRO_INVALIDO' });
  });

  describe('valores que conservan la forma pero rompen los flujos', () => {
    it.each([
      ['un plazo en 0', 'horas_plazo_revision', 72, 0],
      ['un plazo decimal', 'horas_plazo_revision', 72, 1.5],
      ['un plazo astronómico', 'horas_plazo_pago', 48, 10_000_000],
      ['un texto vacío', 'version_politica_datos', '2026-10', '   '],
      ['una lista de dominios vacía', 'dominios_institucionales', ['itp.edu.co'], []],
      ['un dominio con arroba', 'dominios_institucionales', ['itp.edu.co'], ['@itp.edu.co']],
      ['un dominio sin punto', 'dominios_institucionales', ['itp.edu.co'], ['localhost']],
    ])('rechaza %s', async (_caso, clave, actual, nuevo) => {
      const e = crearEntorno(existente(clave, actual));
      const error = await rechazo(e.servicio.actualizar(clave, nuevo, admin, CONTEXTO));
      expect(error).toMatchObject({ codigo: 'PARAMETRO_INVALIDO', status: 422 });
      expect(e.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('la gracia del pago pendiente sí admite 0', async () => {
      const e = crearEntorno(existente('minutos_gracia_pago_pendiente', 120));
      await expect(
        e.servicio.actualizar('minutos_gracia_pago_pendiente', 0, admin, CONTEXTO),
      ).resolves.toMatchObject({ valor: 0 });
    });

    it('normaliza los dominios a minúsculas sin espacios', async () => {
      const e = crearEntorno(existente('dominios_institucionales', ['itp.edu.co']));
      const r = await e.servicio.actualizar(
        'dominios_institucionales',
        [' ITP.edu.co ', 'UniPutumayo.edu.co'],
        admin,
        CONTEXTO,
      );
      expect(r.valor).toEqual(['itp.edu.co', 'uniputumayo.edu.co']);
    });

    it('la política de cancelación no admite dos tramos con los mismos días', async () => {
      const e = crearEntorno(existente('politica_cancelacion', [{ diasAntes: 8, porcentaje: 100 }]));
      const error = await rechazo(
        e.servicio.actualizar(
          'politica_cancelacion',
          [
            { diasAntes: 3, porcentaje: 50 },
            { diasAntes: 3, porcentaje: 80 },
            { diasAntes: 0, porcentaje: 0 },
          ],
          admin,
          CONTEXTO,
        ),
      );
      expect(error).toMatchObject({ codigo: 'PARAMETRO_INVALIDO', status: 422 });
    });
  });

  describe('politica_cancelacion', () => {
    const actual = existente('politica_cancelacion', [{ diasAntes: 8, porcentaje: 100 }]);

    it('acepta tramos válidos que incluyan diasAntes 0', async () => {
      const e = crearEntorno(actual);
      await expect(
        e.servicio.actualizar(
          'politica_cancelacion',
          [
            { diasAntes: 10, porcentaje: 100 },
            { diasAntes: 2, porcentaje: 40 },
            { diasAntes: 0, porcentaje: 0 },
          ],
          admin,
          CONTEXTO,
        ),
      ).resolves.toBeDefined();
    });

    it.each([
      ['porcentaje mayor que 100', [{ diasAntes: 0, porcentaje: 120 }]],
      ['porcentaje negativo', [{ diasAntes: 0, porcentaje: -5 }]],
      ['diasAntes decimal', [{ diasAntes: 1.5, porcentaje: 10 }, { diasAntes: 0, porcentaje: 0 }]],
      ['sin tramo de 0 días', [{ diasAntes: 8, porcentaje: 100 }]],
      ['lista vacía', []],
      ['un objeto', { diasAntes: 0, porcentaje: 0 }],
    ])('rechaza %s', async (_caso, valor) => {
      const e = crearEntorno(actual);
      const error = await rechazo(e.servicio.actualizar('politica_cancelacion', valor, admin, CONTEXTO));
      expect(error).toMatchObject({ codigo: 'PARAMETRO_INVALIDO', status: 422 });
    });
  });

  describe('cuenta_recaudo', () => {
    const actual = existente('cuenta_recaudo', {
      banco: 'x',
      tipo: 'y',
      numero: 'z',
      titular: 't',
      nit: 'n',
    });
    const cuenta = { banco: 'Banco Agrario', tipo: 'Ahorros', numero: '4-123', titular: 'ITP', nit: '800.247.940-1' };

    it('acepta la cuenta completa', async () => {
      const e = crearEntorno(actual);
      await expect(e.servicio.actualizar('cuenta_recaudo', cuenta, admin, CONTEXTO)).resolves.toMatchObject({
        valor: cuenta,
      });
    });

    it.each([
      ['sin número', { ...cuenta, numero: undefined }],
      ['con banco vacío', { ...cuenta, banco: '  ' }],
      ['con un campo extra', { ...cuenta, swift: 'ABC' }],
      ['un texto', 'cuenta'],
    ])('rechaza una cuenta %s', async (_caso, valor) => {
      const e = crearEntorno(actual);
      const error = await rechazo(e.servicio.actualizar('cuenta_recaudo', valor, admin, CONTEXTO));
      expect(error).toMatchObject({ codigo: 'PARAMETRO_INVALIDO', status: 422 });
    });
  });
});
