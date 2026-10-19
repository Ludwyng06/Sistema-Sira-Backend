import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { UsuarioAutenticado } from '../../../shared/auth/decoradores.js';
import { ErrorDominio, noEncontrado } from '../../../shared/errores/error-dominio.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { ParametroDto } from '../dto/parametro-admin.dto.js';
import type { ContextoAdmin } from './usuarios-admin.service.js';

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function esTexto(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim().length > 0;
}

/** ¿`nuevo` conserva la forma de `actual`? Números, textos, booleanos, listas y objetos con las mismas claves. */
export function conservaForma(actual: unknown, nuevo: unknown): boolean {
  if (typeof actual === 'number') return typeof nuevo === 'number' && Number.isFinite(nuevo) && nuevo >= 0;
  if (typeof actual === 'string') return typeof nuevo === 'string';
  if (typeof actual === 'boolean') return typeof nuevo === 'boolean';
  if (Array.isArray(actual)) {
    if (!Array.isArray(nuevo)) return false;
    if (actual.length === 0) return true;
    const modelo = actual[0];
    return nuevo.every((elemento) => conservaForma(modelo, elemento));
  }
  if (esObjeto(actual)) {
    if (!esObjeto(nuevo)) return false;
    const claves = Object.keys(actual).sort();
    const clavesNuevas = Object.keys(nuevo).sort();
    if (claves.length !== clavesNuevas.length || claves.some((c, i) => c !== clavesNuevas[i])) return false;
    return claves.every((clave) => conservaForma(actual[clave], nuevo[clave]));
  }
  return false;
}

function validarPoliticaCancelacion(valor: unknown): boolean {
  return (
    Array.isArray(valor) &&
    valor.length > 0 &&
    valor.every(
      (t) =>
        esObjeto(t) &&
        Number.isInteger(t.diasAntes) &&
        (t.diasAntes as number) >= 0 &&
        typeof t.porcentaje === 'number' &&
        t.porcentaje >= 0 &&
        t.porcentaje <= 100,
    ) &&
    valor.some((t) => (t as { diasAntes: number }).diasAntes === 0) &&
    new Set(valor.map((t) => (t as { diasAntes: number }).diasAntes)).size === valor.length &&
    valor.length <= 20
  );
}

function validarCuentaRecaudo(valor: unknown): boolean {
  return (
    esObjeto(valor) &&
    ['banco', 'tipo', 'numero', 'titular', 'nit'].every(
      (campo) => esTexto(valor[campo]) && (valor[campo] as string).length <= MAXIMO_TEXTO,
    ) &&
    Object.keys(valor).length === 5
  );
}

/** Parámetros numéricos que sí pueden valer 0 (no son plazos que venzan al instante). */
const NUMEROS_QUE_ADMITEN_CERO = new Set(['minutos_gracia_pago_pendiente']);
const MAXIMO_NUMERO = 100_000;
const MAXIMO_TEXTO = 200;
const DOMINIO = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/**
 * Valores que conservan la forma pero rompen los flujos: plazos en 0 o astronómicos (fechas
 * inválidas), textos vacíos, dominios mal formados. Devuelve el mensaje de error o null.
 */
function valorIrrazonable(clave: string, valor: unknown): string | null {
  if (typeof valor === 'number') {
    const minimo = NUMEROS_QUE_ADMITEN_CERO.has(clave) ? 0 : 1;
    if (!Number.isInteger(valor) || valor < minimo || valor > MAXIMO_NUMERO) {
      return `El valor debe ser un entero entre ${minimo} y ${MAXIMO_NUMERO}.`;
    }
  }
  if (typeof valor === 'string' && (valor.trim().length === 0 || valor.length > MAXIMO_TEXTO)) {
    return `El texto no puede estar vacío ni superar ${MAXIMO_TEXTO} caracteres.`;
  }
  if (Array.isArray(valor) && valor.every((e) => typeof e === 'string')) {
    if (clave === 'dominios_institucionales') {
      if (valor.length === 0) return 'Debe haber al menos un dominio institucional.';
      if (valor.some((d) => !DOMINIO.test(d.trim().toLowerCase()))) {
        return 'Cada dominio debe tener el formato itp.edu.co, sin arroba ni espacios.';
      }
    } else if (valor.some((e) => e.trim().length === 0 || e.length > MAXIMO_TEXTO)) {
      return 'Los elementos de la lista no pueden estar vacíos.';
    }
  }
  return null;
}

const VALIDADORES_ESPECIFICOS: Record<string, { valida: (valor: unknown) => boolean; mensaje: string }> = {
  politica_cancelacion: {
    valida: validarPoliticaCancelacion,
    mensaje:
      'La política debe ser una lista de hasta 20 tramos { diasAntes (entero desde 0, sin repetir), ' +
      'porcentaje (0 a 100) } e incluir un tramo con diasAntes 0.',
  },
  cuenta_recaudo: {
    valida: validarCuentaRecaudo,
    mensaje: 'La cuenta debe tener banco, tipo, numero, titular y nit, todos con texto.',
  },
};

@Injectable()
export class ParametrosAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(): Promise<ParametroDto[]> {
    const filas = await this.prisma.parametro.findMany({ orderBy: { clave: 'asc' } });
    return filas.map((f) => ({
      clave: f.clave,
      valor: f.valor,
      descripcion: f.descripcion,
      actualizadoEn: f.actualizadoEn.toISOString(),
    }));
  }

  async actualizar(
    clave: string,
    valor: unknown,
    actor: UsuarioAutenticado,
    contexto: ContextoAdmin,
  ): Promise<ParametroDto> {
    const actual = await this.prisma.parametro.findUnique({ where: { clave } });
    if (!actual) throw noEncontrado('El parámetro');

    const especifico = VALIDADORES_ESPECIFICOS[clave];
    if (especifico) {
      if (!especifico.valida(valor)) {
        throw new ErrorDominio('PARAMETRO_INVALIDO', especifico.mensaje, 422, { clave });
      }
    } else if (!conservaForma(actual.valor, valor)) {
      throw new ErrorDominio(
        'PARAMETRO_INVALIDO',
        'El valor no tiene la forma del parámetro actual (tipo, claves o elementos distintos).',
        422,
        { clave },
      );
    }

    const irrazonable = valorIrrazonable(clave, valor);
    if (irrazonable) throw new ErrorDominio('PARAMETRO_INVALIDO', irrazonable, 422, { clave });
    if (clave === 'dominios_institucionales') {
      valor = (valor as string[]).map((d) => d.trim().toLowerCase());
    }

    const fila = await this.prisma.$transaction(async (tx) => {
      const actualizada = await tx.parametro.update({
        where: { clave },
        data: { valor: valor as Prisma.InputJsonValue },
      });
      await tx.bitacora.create({
        data: {
          usuarioId: actor.id,
          accion: 'PARAMETRO_ACTUALIZADO',
          entidad: 'Parametro',
          entidadId: clave,
          datosAntes: { valor: actual.valor } as Prisma.InputJsonValue,
          datosDespues: { valor } as Prisma.InputJsonValue,
          ip: contexto.ip,
          userAgent: contexto.userAgent,
          correlacionId: contexto.correlacionId,
        },
      });
      return actualizada;
    });
    return {
      clave: fila.clave,
      valor: fila.valor,
      descripcion: fila.descripcion,
      actualizadoEn: fila.actualizadoEn.toISOString(),
    };
  }
}
