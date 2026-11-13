/** Claves relativas al almacén, nunca rutas del sistema operativo. */
export const ALMACENAMIENTO = Symbol('ALMACENAMIENTO');

export interface AlmacenamientoPort {
  guardar(clave: string, contenido: Buffer, tipoMime: string): Promise<void>;
  /** Archivo ausente: null, como esperan los consumidores de documentos y fotografías. */
  leer(clave: string): Promise<Buffer | null>;
  eliminar(clave: string): Promise<void>;
}
