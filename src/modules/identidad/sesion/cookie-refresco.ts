export const NOMBRE_COOKIE_REFRESCO = 'sira_refresh';

const RUTA_COOKIE_REFRESCO = '/api/auth';

export interface OpcionesLimpiarCookieRefresco {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: string;
}

export interface OpcionesCookieRefresco extends OpcionesLimpiarCookieRefresco {
  expires: Date;
}

function decodificar(valor: string): string {
  try {
    return decodeURIComponent(valor);
  } catch {
    return valor;
  }
}

export function leerCookieRefresco(cabeceraCookie: string | undefined): string | null {
  if (!cabeceraCookie) return null;
  for (const par of cabeceraCookie.split(';')) {
    const separador = par.indexOf('=');
    if (separador === -1) continue;
    if (par.slice(0, separador).trim() !== NOMBRE_COOKIE_REFRESCO) continue;
    const valor = decodificar(par.slice(separador + 1).trim());
    return valor === '' ? null : valor;
  }
  return null;
}

export function opcionesLimpiarCookieRefresco(produccion: boolean): OpcionesLimpiarCookieRefresco {
  return { httpOnly: true, secure: produccion, sameSite: 'lax', path: RUTA_COOKIE_REFRESCO };
}

export function opcionesCookieRefresco(produccion: boolean, expira: Date): OpcionesCookieRefresco {
  return { ...opcionesLimpiarCookieRefresco(produccion), expires: expira };
}
