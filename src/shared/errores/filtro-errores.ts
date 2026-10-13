import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorDominio } from './error-dominio.js';

interface CuerpoError {
  codigo: string;
  mensaje: string;
  detalles?: unknown;
  correlacionId: string;
}

const CODIGO_POR_STATUS: Record<number, { codigo: string; mensaje: string }> = {
  400: { codigo: 'DATOS_INVALIDOS', mensaje: 'Los datos enviados no son válidos.' },
  401: { codigo: 'NO_AUTENTICADO', mensaje: 'Debes iniciar sesión para continuar.' },
  403: { codigo: 'SIN_PERMISO', mensaje: 'No tienes permiso para realizar esta acción.' },
  404: { codigo: 'NO_ENCONTRADO', mensaje: 'El recurso solicitado no existe.' },
  409: { codigo: 'CONFLICTO', mensaje: 'La operación entra en conflicto con el estado actual.' },
  429: {
    codigo: 'DEMASIADAS_PETICIONES',
    mensaje: 'Has hecho demasiadas peticiones. Intenta de nuevo en un momento.',
  },
};

/** Busca códigos de error de PostgreSQL o Prisma dentro de la cadena de causas. */
function inspeccionar(error: unknown, profundidad = 0): { codigos: string[]; texto: string } {
  const codigos: string[] = [];
  let texto = '';
  if (profundidad > 5 || error === null || typeof error !== 'object') {
    return { codigos, texto };
  }
  const e = error as Record<string, unknown>;
  if (typeof e.code === 'string') codigos.push(e.code);
  if (typeof e.message === 'string') texto += ` ${e.message}`;
  if (typeof e.constraint === 'string') texto += ` ${e.constraint}`;
  for (const clave of ['cause', 'originalCode', 'originalMessage', 'meta', 'driverAdapterError']) {
    const interno = e[clave];
    if (typeof interno === 'string') {
      texto += ` ${interno}`;
      if (clave === 'originalCode') codigos.push(interno);
    } else if (interno && typeof interno === 'object') {
      const hijo = inspeccionar(interno, profundidad + 1);
      codigos.push(...hijo.codigos);
      texto += hijo.texto;
    }
  }
  return { codigos, texto };
}

@Catch()
export class FiltroErrores implements ExceptionFilter {
  private readonly logger = new Logger(FiltroErrores.name);

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const correlacionId = String(req.headers['x-correlation-id'] ?? '');

    const { status, cuerpo } = this.traducir(excepcion, correlacionId);
    if (status >= 500) {
      this.logger.error(
        `[${correlacionId}] ${req.method} ${req.url}`,
        excepcion instanceof Error ? excepcion.stack : String(excepcion),
      );
    }
    res.status(status).json(cuerpo);
  }

  private traducir(
    excepcion: unknown,
    correlacionId: string,
  ): { status: number; cuerpo: CuerpoError } {
    if (excepcion instanceof ErrorDominio) {
      return {
        status: excepcion.status,
        cuerpo: {
          codigo: excepcion.codigo,
          mensaje: excepcion.message,
          ...(excepcion.detalles !== undefined ? { detalles: excepcion.detalles } : {}),
          correlacionId,
        },
      };
    }

    const { codigos, texto } = inspeccionar(excepcion);

    if (codigos.includes('23P01') || texto.includes('sin_solapamiento')) {
      return {
        status: 409,
        cuerpo: {
          codigo: 'FRANJA_NO_DISPONIBLE',
          mensaje: 'El espacio ya está ocupado en la franja solicitada.',
          correlacionId,
        },
      };
    }
    if (codigos.includes('P2002') || codigos.includes('23505')) {
      return {
        status: 409,
        cuerpo: {
          codigo: 'REGISTRO_DUPLICADO',
          mensaje: 'Ya existe un registro con esos datos.',
          correlacionId,
        },
      };
    }
    if (codigos.includes('P2025')) {
      return {
        status: 404,
        cuerpo: {
          codigo: 'NO_ENCONTRADO',
          mensaje: 'El recurso solicitado no existe.',
          correlacionId,
        },
      };
    }

    if (excepcion instanceof HttpException) {
      const status = excepcion.getStatus();
      const base = CODIGO_POR_STATUS[status];
      const respuesta = excepcion.getResponse();
      const mensajes =
        typeof respuesta === 'object' && respuesta !== null
          ? (respuesta as { message?: unknown }).message
          : undefined;

      if (status === 400 && Array.isArray(mensajes)) {
        return {
          status,
          cuerpo: {
            codigo: 'DATOS_INVALIDOS',
            mensaje: base.mensaje,
            detalles: { campos: mensajes },
            correlacionId,
          },
        };
      }
      return {
        status,
        cuerpo: {
          codigo: base?.codigo ?? 'ERROR',
          mensaje: base?.mensaje ?? 'No se pudo completar la operación.',
          correlacionId,
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      cuerpo: {
        codigo: 'ERROR_INTERNO',
        mensaje: 'Ocurrió un error inesperado. Intenta de nuevo más tarde.',
        correlacionId,
      },
    };
  }
}
