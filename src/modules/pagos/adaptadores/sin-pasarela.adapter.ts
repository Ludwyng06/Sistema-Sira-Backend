import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import type { CrearTransaccionEntrada, EstadoTransaccion, EventoInterpretado, PasarelaDesactivadaPort } from '../puertos/pasarela.port.js';

export class SinPasarelaAdapter implements PasarelaDesactivadaPort {
  readonly proveedor = 'NINGUNA' as const;
  private desactivada(): never {
    throw new ErrorDominio('PASARELA_DESACTIVADA', 'El pago en línea no está disponible. Usa consignación.', 503);
  }
  async crearTransaccion(_entrada: CrearTransaccionEntrada): Promise<{ urlCheckout: string; transaccionExternaId: string | null }> { return this.desactivada(); }
  verificarFirmaWebhook(_crudo: string, _cabeceras: Record<string, string>): boolean { return false; }
  interpretarEvento(_cuerpo: unknown): EventoInterpretado { return this.desactivada(); }
  async consultarTransaccion(_id: string): Promise<EventoInterpretado> { return this.desactivada(); }
  async consultarPorReferencia(_referencia: string): Promise<EventoInterpretado | null> { return this.desactivada(); }
  async consultarEstado(_id: string): Promise<EstadoTransaccion> { return this.desactivada(); }
  async reembolsar(_id: string, _valorPesos?: number): Promise<{ id: string; estado: string }> { return this.desactivada(); }
}
