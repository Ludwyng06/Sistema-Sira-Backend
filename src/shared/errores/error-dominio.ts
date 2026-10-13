/**
 * Error de regla de negocio. El `mensaje` está escrito para el usuario final.
 * El filtro global lo traduce a HTTP con la forma { codigo, mensaje, detalles?, correlacionId }.
 */
export class ErrorDominio extends Error {
  constructor(
    public readonly codigo: string,
    mensaje: string,
    public readonly status: number = 422,
    public readonly detalles?: unknown,
  ) {
    super(mensaje);
    this.name = 'ErrorDominio';
  }
}

/** 404: el recurso no existe o el usuario no tiene acceso a él. */
export function noEncontrado(recurso: string): ErrorDominio {
  return new ErrorDominio('NO_ENCONTRADO', `${recurso} no existe o no está disponible.`, 404);
}
