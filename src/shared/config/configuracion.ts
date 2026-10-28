export interface Configuracion {
  NODE_ENV: string;
  PORT: number;
  TZ: string;
  FRONTEND_URL: string;
  DATABASE_URL: string;
  JWT_ACCESS_SECRETO: string;
  JWT_ACCESS_EXPIRA: string;
  JWT_REFRESH_SECRETO: string;
  JWT_REFRESH_DIAS: number;
  REDIS_URL: string;
  S3_ENDPOINT: string;
  S3_REGION: string;
  S3_BUCKET: string;
  S3_ACCESS_KEY: string;
  S3_SECRET_KEY: string;
  S3_URL_PUBLICA: string;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_USUARIO: string;
  SMTP_CONTRASENA: string;
  CORREO_REMITENTE: string;
  ALMACENAMIENTO_DIR: string;
}

// Las variables S3 son opcionales: hoy los archivos van al disco (ALMACENAMIENTO_DIR) y S3 queda para la etapa 2.
const OBLIGATORIAS = [
  'FRONTEND_URL',
  'DATABASE_URL',
  'JWT_ACCESS_SECRETO',
  'JWT_REFRESH_SECRETO',
  'REDIS_URL',
  'SMTP_HOST',
  'CORREO_REMITENTE',
] as const;

const MINIMO_SECRETO_PRODUCCION = 32;

function numero(valor: unknown, defecto: number, nombre: string): number {
  if (valor === undefined || valor === '') return defecto;
  const n = Number(valor);
  if (!Number.isFinite(n)) throw new Error(`La variable ${nombre} debe ser un número.`);
  return n;
}

/**
 * Para `ConfigModule.forRoot({ validate })`. Falla al arrancar si falta una
 * variable obligatoria y, en producción, rechaza secretos JWT débiles.
 */
export function validarConfiguracion(entrada: Record<string, unknown>): Configuracion {
  const faltantes = OBLIGATORIAS.filter((clave) => {
    const valor = entrada[clave];
    return valor === undefined || valor === null || String(valor).trim() === '';
  });
  if (faltantes.length > 0) {
    throw new Error(`Faltan variables de entorno obligatorias: ${faltantes.join(', ')}.`);
  }

  const texto = (clave: string, defecto = ''): string =>
    entrada[clave] === undefined ? defecto : String(entrada[clave]);

  const configuracion: Configuracion = {
    NODE_ENV: texto('NODE_ENV', 'development'),
    PORT: numero(entrada.PORT, 3001, 'PORT'),
    TZ: texto('TZ', 'UTC'),
    FRONTEND_URL: texto('FRONTEND_URL'),
    DATABASE_URL: texto('DATABASE_URL'),
    JWT_ACCESS_SECRETO: texto('JWT_ACCESS_SECRETO'),
    JWT_ACCESS_EXPIRA: texto('JWT_ACCESS_EXPIRA', '15m'),
    JWT_REFRESH_SECRETO: texto('JWT_REFRESH_SECRETO'),
    JWT_REFRESH_DIAS: numero(entrada.JWT_REFRESH_DIAS, 7, 'JWT_REFRESH_DIAS'),
    REDIS_URL: texto('REDIS_URL'),
    S3_ENDPOINT: texto('S3_ENDPOINT'),
    S3_REGION: texto('S3_REGION', 'us-east-1'),
    S3_BUCKET: texto('S3_BUCKET'),
    S3_ACCESS_KEY: texto('S3_ACCESS_KEY'),
    S3_SECRET_KEY: texto('S3_SECRET_KEY'),
    S3_URL_PUBLICA: texto('S3_URL_PUBLICA'),
    SMTP_HOST: texto('SMTP_HOST'),
    SMTP_PORT: numero(entrada.SMTP_PORT, 1025, 'SMTP_PORT'),
    SMTP_USUARIO: texto('SMTP_USUARIO'),
    SMTP_CONTRASENA: texto('SMTP_CONTRASENA'),
    CORREO_REMITENTE: texto('CORREO_REMITENTE'),
    ALMACENAMIENTO_DIR: texto('ALMACENAMIENTO_DIR', './almacenamiento'),
  };

  if (configuracion.NODE_ENV === 'production') {
    for (const clave of ['JWT_ACCESS_SECRETO', 'JWT_REFRESH_SECRETO'] as const) {
      if (configuracion[clave].length < MINIMO_SECRETO_PRODUCCION) {
        throw new Error(
          `${clave} debe tener al menos ${MINIMO_SECRETO_PRODUCCION} caracteres en producción.`,
        );
      }
    }
  }

  return configuracion;
}
