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
  PASARELA_PROVEEDOR: 'wompi' | 'epayco' | 'bold' | 'ecollect' | 'ninguna';
  WOMPI_AMBIENTE: 'test' | 'prod';
  WOMPI_URL_API: string;
  WOMPI_LLAVE_PUBLICA: string;
  WOMPI_LLAVE_PRIVADA: string;
  WOMPI_SECRETO_EVENTOS: string;
  WOMPI_SECRETO_INTEGRIDAD: string;
  EPAYCO_AMBIENTE: 'test' | 'prod';
  EPAYCO_P_CUST_ID_CLIENTE: string;
  EPAYCO_P_KEY: string;
  EPAYCO_LLAVE_PUBLICA: string;
  EPAYCO_LLAVE_PRIVADA: string;
  EPAYCO_URL_CONFIRMACION: string;
  BOLD_AMBIENTE: 'test' | 'prod';
  BOLD_LLAVE_IDENTIDAD: string;
  BOLD_LLAVE_SECRETA: string;
  ECOLLECT_AMBIENTE: 'test' | 'prod';
  ECOLLECT_ENTITY_CODE: string;
  ECOLLECT_SRV_CODE: string;
  ECOLLECT_API_KEY: string;
  ECOLLECT_URL_API: string;
  PASARELA_CONSULTA_MINUTOS: number;
  PASARELA_GRACIA_MINUTOS: number;
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
  const proveedor = texto('PASARELA_PROVEEDOR', 'ninguna').trim();
  if (proveedor !== 'ninguna' && proveedor !== 'wompi' && proveedor !== 'epayco' && proveedor !== 'bold' && proveedor !== 'ecollect') {
    throw new Error('PASARELA_PROVEEDOR debe ser ninguna, wompi, epayco, bold o ecollect.');
  }
  const leerAmbiente = (nombre: string): 'test' | 'prod' => {
    const valor = texto(nombre, 'test').trim();
    if (valor !== 'test' && valor !== 'prod') throw new Error(`${nombre} debe ser test o prod.`);
    return valor;
  };
  const ambiente = texto('WOMPI_AMBIENTE', 'test').trim();
  if (ambiente !== 'test' && ambiente !== 'prod') throw new Error('WOMPI_AMBIENTE debe ser test o prod.');
  const urlWompi = ambiente === 'test' ? 'https://sandbox.wompi.co/v1' : 'https://production.wompi.co/v1';

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
    PASARELA_PROVEEDOR: proveedor,
    WOMPI_AMBIENTE: ambiente,
    WOMPI_URL_API: (texto('WOMPI_URL_API').trim() || urlWompi).replace(/\/$/, ''),
    WOMPI_LLAVE_PUBLICA: texto('WOMPI_LLAVE_PUBLICA').trim(),
    WOMPI_LLAVE_PRIVADA: texto('WOMPI_LLAVE_PRIVADA').trim(),
    WOMPI_SECRETO_EVENTOS: texto('WOMPI_SECRETO_EVENTOS').trim(),
    WOMPI_SECRETO_INTEGRIDAD: texto('WOMPI_SECRETO_INTEGRIDAD').trim(),
    EPAYCO_AMBIENTE: leerAmbiente('EPAYCO_AMBIENTE'),
    EPAYCO_P_CUST_ID_CLIENTE: texto('EPAYCO_P_CUST_ID_CLIENTE').trim(),
    EPAYCO_P_KEY: texto('EPAYCO_P_KEY').trim(),
    EPAYCO_LLAVE_PUBLICA: texto('EPAYCO_LLAVE_PUBLICA').trim(),
    EPAYCO_LLAVE_PRIVADA: texto('EPAYCO_LLAVE_PRIVADA').trim(),
    EPAYCO_URL_CONFIRMACION: texto('EPAYCO_URL_CONFIRMACION').trim(),
    BOLD_AMBIENTE: leerAmbiente('BOLD_AMBIENTE'),
    BOLD_LLAVE_IDENTIDAD: texto('BOLD_LLAVE_IDENTIDAD').trim(),
    BOLD_LLAVE_SECRETA: texto('BOLD_LLAVE_SECRETA').trim(),
    ECOLLECT_AMBIENTE: leerAmbiente('ECOLLECT_AMBIENTE'),
    ECOLLECT_ENTITY_CODE: texto('ECOLLECT_ENTITY_CODE').trim(),
    ECOLLECT_SRV_CODE: texto('ECOLLECT_SRV_CODE').trim(),
    ECOLLECT_API_KEY: texto('ECOLLECT_API_KEY').trim(),
    ECOLLECT_URL_API: texto('ECOLLECT_URL_API').trim(),
    PASARELA_CONSULTA_MINUTOS: numero(entrada.PASARELA_CONSULTA_MINUTOS, 30, 'PASARELA_CONSULTA_MINUTOS'),
    PASARELA_GRACIA_MINUTOS: numero(entrada.PASARELA_GRACIA_MINUTOS, 120, 'PASARELA_GRACIA_MINUTOS'),
  };

  for (const clave of ['PASARELA_CONSULTA_MINUTOS', 'PASARELA_GRACIA_MINUTOS'] as const) {
    const valor = configuracion[clave];
    if (!Number.isSafeInteger(valor) || valor < 1 || valor > 1440) {
      throw new Error(`${clave} debe ser un entero entre 1 y 1440 minutos.`);
    }
  }
  if (proveedor === 'wompi') {
    const llaves = ['WOMPI_LLAVE_PUBLICA', 'WOMPI_LLAVE_PRIVADA', 'WOMPI_SECRETO_EVENTOS', 'WOMPI_SECRETO_INTEGRIDAD'] as const;
    const ausentes = llaves.filter((clave) => !configuracion[clave]);
    if (ausentes.length) throw new Error(`Faltan variables de pasarela: ${ausentes.join(', ')}.`);
    if (configuracion.WOMPI_URL_API !== urlWompi) {
      throw new Error(`WOMPI_URL_API debe apuntar a ${urlWompi} para WOMPI_AMBIENTE=${ambiente}.`);
    }
    if (!configuracion.WOMPI_LLAVE_PUBLICA.startsWith(`pub_${ambiente}_`) ||
        !configuracion.WOMPI_LLAVE_PRIVADA.startsWith(`prv_${ambiente}_`)) {
      throw new Error(`Las llaves Wompi deben corresponder al ambiente ${ambiente} (test=sandbox).`);
    }
  }
  const obligatoriasProveedor: readonly (keyof Configuracion)[] = proveedor === 'epayco'
    ? ['EPAYCO_P_CUST_ID_CLIENTE', 'EPAYCO_P_KEY', 'EPAYCO_LLAVE_PUBLICA', 'EPAYCO_LLAVE_PRIVADA', 'EPAYCO_URL_CONFIRMACION'] as const
    : proveedor === 'bold' ? ['BOLD_LLAVE_IDENTIDAD', 'BOLD_LLAVE_SECRETA'] as const
    : proveedor === 'ecollect' ? ['ECOLLECT_ENTITY_CODE', 'ECOLLECT_SRV_CODE', 'ECOLLECT_API_KEY', 'ECOLLECT_URL_API'] as const : [];
  const ausentesProveedor = obligatoriasProveedor.filter((clave) => !configuracion[clave]);
  if (ausentesProveedor.length) throw new Error(`Faltan variables de pasarela: ${ausentesProveedor.join(', ')}.`);
  if (proveedor === 'epayco') {
    let url: URL;
    try { url = new URL(configuracion.EPAYCO_URL_CONFIRMACION); }
    catch { throw new Error('EPAYCO_URL_CONFIRMACION debe ser una URL válida.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash ||
        (configuracion.EPAYCO_AMBIENTE === 'prod' && url.protocol !== 'https:')) {
      throw new Error('EPAYCO_URL_CONFIRMACION debe usar HTTP(S), HTTPS en producción, sin credenciales ni fragmentos.');
    }
  }

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
