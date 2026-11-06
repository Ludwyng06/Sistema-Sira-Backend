import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Prisma } from '../../generated/prisma/client.js';
import { mergeMap, type Observable } from 'rxjs';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { CLAVE_AUDITAR, type OpcionesAuditar } from './auditar.decorador.js';

interface PeticionAuditable {
  user?: { id: string };
  params?: Record<string, string>;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

const MAXIMO_JSON = 4_000;

function aTexto(valor: string | string[] | undefined): string | null {
  return Array.isArray(valor) ? (valor[0] ?? null) : (valor ?? null);
}

const CLAVE_SENSIBLE = /contrase|password|secreto|token|hash|refresh|authorization|cookie|codigoverificacion/i;
const REDACTADO = '[REDACTADO]';

/**
 * La bitácora es de lectura amplia (administración y auditoría) y no se puede corregir después: ningún
 * secreto entra. Se reemplazan por clave, en cualquier nivel, y los códigos numéricos de 6 dígitos.
 */
export function redactar(valor: unknown, profundidad = 0): unknown {
  if (profundidad > 8) return REDACTADO;
  if (Array.isArray(valor)) return valor.map((v) => redactar(v, profundidad + 1));
  if (valor !== null && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>).map(([clave, v]) => [
        clave,
        CLAVE_SENSIBLE.test(clave) || (clave === 'codigo' && typeof v === 'string' && /^\d{6}$/.test(v))
          ? REDACTADO
          : redactar(v, profundidad + 1),
      ]),
    );
  }
  return valor;
}

function resumir(respuesta: unknown): Prisma.InputJsonValue | undefined {
  if (respuesta === null || typeof respuesta !== 'object') return undefined;
  const texto = JSON.stringify(redactar(JSON.parse(JSON.stringify(respuesta))));
  if (texto.length > MAXIMO_JSON) return { truncado: true };
  return JSON.parse(texto) as Prisma.InputJsonValue;
}

@Injectable()
export class AuditarInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditarInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(contexto: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    const opciones = this.reflector.get<OpcionesAuditar | undefined>(CLAVE_AUDITAR, contexto.getHandler());
    if (!opciones) return siguiente.handle();

    const peticion = contexto.switchToHttp().getRequest<PeticionAuditable>();
    return siguiente.handle().pipe(
      mergeMap(async (respuesta: unknown) => {
        await this.registrar(opciones, peticion, respuesta);
        return respuesta;
      }),
    );
  }

  private async registrar(
    opciones: OpcionesAuditar,
    peticion: PeticionAuditable,
    respuesta: unknown,
  ): Promise<void> {
    try {
      const idRespuesta =
        respuesta !== null && typeof respuesta === 'object' && 'id' in respuesta
          ? String((respuesta as { id: unknown }).id)
          : null;
      await this.prisma.bitacora.create({
        data: {
          usuarioId: peticion.user?.id ?? null,
          accion: opciones.accion,
          entidad: opciones.entidad,
          entidadId: peticion.params?.id ?? idRespuesta,
          datosDespues: resumir(respuesta),
          ip: peticion.ip ?? null,
          userAgent: aTexto(peticion.headers['user-agent']),
          correlacionId: aTexto(peticion.headers['x-correlation-id']),
        },
      });
    } catch (error) {
      this.logger.error(
        `No se pudo registrar la acción ${opciones.accion} en la bitácora.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
