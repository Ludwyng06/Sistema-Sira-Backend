/**
 * Lector mínimo de CSV (RFC 4180): campos entre comillas, comillas dobles escapadas, saltos de línea
 * dentro de comillas, y coma o punto y coma como separador (Excel en español usa «;»).
 */
export interface FilaCsv {
  /** Número de línea del archivo, comenzando en 1 por el encabezado. */
  linea: number;
  valores: Record<string, string>;
}

export interface ResultadoCsv {
  encabezados: string[];
  filas: FilaCsv[];
}

function detectarSeparador(primeraLinea: string): string {
  const comas = (primeraLinea.match(/,/g) ?? []).length;
  const puntosYComa = (primeraLinea.match(/;/g) ?? []).length;
  return puntosYComa > comas ? ';' : ',';
}

export function leerCsv(texto: string): ResultadoCsv {
  const contenido = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  const separador = detectarSeparador(contenido.split(/\r?\n/, 1)[0] ?? '');

  const registros: { linea: number; campos: string[] }[] = [];
  let campos: string[] = [];
  let campo = '';
  let entreComillas = false;
  let linea = 1;
  let lineaInicio = 1;

  const cerrarRegistro = () => {
    campos.push(campo);
    if (campos.some((c) => c.trim() !== '')) registros.push({ linea: lineaInicio, campos });
    campos = [];
    campo = '';
  };

  for (let i = 0; i < contenido.length; i += 1) {
    const c = contenido[i]!;
    if (entreComillas) {
      if (c === '"' && contenido[i + 1] === '"') {
        campo += '"';
        i += 1;
      } else if (c === '"') {
        entreComillas = false;
      } else {
        if (c === '\n') linea += 1;
        campo += c;
      }
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === separador) {
      campos.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && contenido[i + 1] === '\n') i += 1;
      cerrarRegistro();
      linea += 1;
      lineaInicio = linea;
    } else {
      campo += c;
    }
  }
  if (campo !== '' || campos.length > 0) cerrarRegistro();

  const [cabecera, ...cuerpo] = registros;
  if (!cabecera) return { encabezados: [], filas: [] };
  const encabezados = cabecera.campos.map((h) => h.trim().toLowerCase());
  const filas = cuerpo.map((registro) => ({
    linea: registro.linea,
    valores: Object.fromEntries(encabezados.map((h, i) => [h, (registro.campos[i] ?? '').trim()])),
  }));
  return { encabezados, filas };
}
