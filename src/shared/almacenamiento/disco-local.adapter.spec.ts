import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DiscoLocalAdapter } from './disco-local.adapter.js';

const raices: string[] = [];
async function entorno() {
  const raiz = await mkdtemp(join(tmpdir(), 'sira-almacenamiento-'));
  raices.push(raiz);
  return new DiscoLocalAdapter(new ConfigService({ ALMACENAMIENTO_DIR: raiz }));
}
afterEach(async () => { for (const raiz of raices.splice(0)) await rm(raiz, { recursive: true, force: true }); });

describe('DiscoLocalAdapter', () => {
  it('guarda y lee bytes sin transformarlos y elimina de forma idempotente', async () => {
    const adaptador = await entorno(); const bytes = Buffer.from([0, 1, 255, 23]);
    await adaptador.guardar('solicitudes/uuid/soporte.pdf', bytes, 'application/pdf');
    expect(await adaptador.leer('solicitudes/uuid/soporte.pdf')).toEqual(bytes);
    await adaptador.eliminar('solicitudes/uuid/soporte.pdf');
    await adaptador.eliminar('solicitudes/uuid/soporte.pdf');
    expect(await adaptador.leer('solicitudes/uuid/soporte.pdf')).toBeNull();
  });

  it.each(['../fuera', '/absoluta', 'a/../../fuera', 'C:/fuera', 'a\\..\\fuera', 'a//b', '', 'a/.. /fuera', 'CON', 'a/nul.txt'])
    ('rechaza la clave peligrosa %j para todas las operaciones', async (clave) => {
      const adaptador = await entorno();
      await expect(adaptador.guardar(clave, Buffer.from('x'), 'text/plain')).rejects.toThrow();
      await expect(adaptador.leer(clave)).rejects.toThrow();
      await expect(adaptador.eliminar(clave)).rejects.toThrow();
    });
});
