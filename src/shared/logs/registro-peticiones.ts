import type { NextFunction, Request, Response } from 'express';

export interface LineaPeticion {
  nivel: 'info' | 'warn' | 'error';
  momento: string;
  mensaje: 'peticion';
  metodo: string;
  ruta: string;
  estado: number;
  duracionMs: number;
  correlacionId: string | null;
  usuarioId: string | null;
}

/** Sin cadena de consulta: puede traer correos, códigos o fechas personales. */
function rutaSinConsulta(url: string): string {
  const corte = url.indexOf('?');
  return corte === -1 ? url : url.slice(0, corte);
}

function nivelPara(estado: number): LineaPeticion['nivel'] {
  if (estado >= 500) return 'error';
  if (estado >= 400) return 'warn';
  return 'info';
}

export function crearLineaPeticion(
  req: Pick<Request, 'method' | 'originalUrl' | 'headers'> & {
    user?: { id?: string };
  },
  estado: number,
  duracionMs: number,
  ahora: Date = new Date(),
): LineaPeticion {
  const correlacion = req.headers['x-correlation-id'];
  return {
    nivel: nivelPara(estado),
    momento: ahora.toISOString(),
    mensaje: 'peticion',
    metodo: req.method,
    ruta: rutaSinConsulta(req.originalUrl),
    estado,
    duracionMs,
    correlacionId: typeof correlacion === 'string' ? correlacion : null,
    usuarioId: req.user?.id ?? null,
  };
}

/**
 * RNF-15: una línea JSON por petición con el `correlacionId`, el estado y la duración. Nunca registra cuerpo,
 * cabeceras de autorización ni la cadena de consulta.
 */
export function registroPeticiones(
  escribir: (linea: string) => void = (l) => process.stdout.write(`${l}\n`),
) {
  return (req: Request, res: Response, siguiente: NextFunction): void => {
    const inicio = process.hrtime.bigint();
    res.on('finish', () => {
      const duracionMs = Number(
        (process.hrtime.bigint() - inicio) / 1_000_000n,
      );
      escribir(
        JSON.stringify(
          crearLineaPeticion(
            req as Request & { user?: { id?: string } },
            res.statusCode,
            duracionMs,
          ),
        ),
      );
    });
    siguiente();
  };
}
