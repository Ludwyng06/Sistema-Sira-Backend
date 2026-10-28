/**
 * Puerto hexagonal de correo: el dominio depende de este contrato, no de SMTP.
 * Se aplica la arquitectura hexagonal en correo según `03-backend.md` §§1 y 8.
 */
export interface MensajeCorreo {
  para: string;
  asunto: string;
  html: string;
  texto: string;
}

export interface CorreoPort {
  enviar(mensaje: MensajeCorreo): Promise<void>;
}

/** Token de inyección: `@Inject(CORREO) private readonly correo: CorreoPort` */
export const CORREO = Symbol('CORREO');
