import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lstat, mkdir, readFile, realpath, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { AlmacenamientoPort } from './almacenamiento.port.js';

@Injectable()
export class DiscoLocalAdapter implements AlmacenamientoPort {
  private readonly raiz: string;

  constructor(config: ConfigService) {
    this.raiz = resolve(config.get<string>('ALMACENAMIENTO_DIR') || './almacenamiento');
  }

  private async ruta(clave: string, crear: boolean): Promise<string> {
    // Rechaza también sintaxis Windows aunque se ejecute en Linux.
    if (!clave || isAbsolute(clave) || clave.includes('\u0000') || /[\\:]/.test(clave) ||
        clave.split('/').some((parte) => !parte || parte === '.' || parte === '..' || /[. ]$/.test(parte) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(parte))) {
      throw new Error('Clave de almacenamiento inválida.');
    }
    const destino = resolve(this.raiz, clave);
    const dentro = relative(this.raiz, destino);
    if (!dentro || dentro === '..' || dentro.startsWith(`..${sep}`) || isAbsolute(dentro)) {
      throw new Error('Clave fuera del almacenamiento.');
    }
    await mkdir(this.raiz, { recursive: true });
    // No se siguen enlaces simbólicos, ni en directorios ni en el archivo final.
    let actual = this.raiz;
    for (const parte of dentro.split(sep)) {
      actual = resolve(actual, parte);
      try {
        if ((await lstat(actual)).isSymbolicLink()) throw new Error('Enlace no permitido en almacenamiento.');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    if (crear) await mkdir(dirname(destino), { recursive: true });
    // La raíz puede ser un directorio montado; todo padre existente debe permanecer dentro.
    const baseReal = await realpath(this.raiz);
    try {
      const padreReal = await realpath(dirname(destino));
      const padreRelativo = relative(baseReal, padreReal);
      if (padreRelativo === '..' || padreRelativo.startsWith(`..${sep}`) || isAbsolute(padreRelativo)) {
        throw new Error('Directorio fuera del almacenamiento.');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return destino;
  }

  async guardar(clave: string, contenido: Buffer, _tipoMime: string): Promise<void> {
    await writeFile(await this.ruta(clave, true), contenido);
  }

  async leer(clave: string): Promise<Buffer | null> {
    try {
      return await readFile(await this.ruta(clave, false));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async eliminar(clave: string): Promise<void> {
    try {
      await unlink(await this.ruta(clave, false));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
