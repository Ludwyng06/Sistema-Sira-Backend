import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ParametroService {
  constructor(private readonly prisma: PrismaService) {}

  async obtenerNumero(clave: string): Promise<number> {
    const valor = await this.obtenerValor(clave);
    if (typeof valor !== 'number' || !Number.isFinite(valor)) {
      throw new Error(`El parámetro "${clave}" debe ser un número finito.`);
    }
    return valor;
  }

  async obtenerTexto(clave: string): Promise<string> {
    const valor = await this.obtenerValor(clave);
    if (typeof valor !== 'string') {
      throw new Error(`El parámetro "${clave}" debe ser texto.`);
    }
    return valor;
  }

  async obtenerListaTexto(clave: string): Promise<string[]> {
    const valor = await this.obtenerValor(clave);
    if (!Array.isArray(valor) || !valor.every((elemento) => typeof elemento === 'string')) {
      throw new Error(`El parámetro "${clave}" debe ser un arreglo de textos.`);
    }
    return valor;
  }

  /** Parámetro estructurado (arreglo u objeto JSON); el llamador valida su forma. */
  async obtenerJson(clave: string): Promise<unknown> {
    return this.obtenerValor(clave);
  }

  private async obtenerValor(clave: string): Promise<unknown> {
    const parametro = await this.prisma.parametro.findUnique({
      where: { clave },
      select: { valor: true },
    });
    if (!parametro) throw new Error(`El parámetro "${clave}" no existe.`);
    return parametro.valor;
  }
}
