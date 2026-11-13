import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import type { CrearTransaccionEntrada, EstadoTransaccion, EventoInterpretado, PasarelaPort } from '../puertos/pasarela.port.js';

export class SinPasarelaAdapter implements PasarelaPort {
  readonly proveedor = 'NINGUNA';
  private desactivada(): never {
    throw new ErrorDominio('PASARELA_DESACTIVADA', 'El pago en línea no está disponible. Usa consignación.', 503);
  }
  async crearTransaccion(_entrada: CrearTransaccionEntrada): Promise<{ urlCheckout: string; transaccionExternaId: string | null }> { return this.desactivada(); }
  verificarFirmaWebhook(_crudo: string, _cabeceras: Record<string, string>): boolean { return false; }
  interpretarEvento(_cuerpo: unknown): EventoInterpretado { return this.desactivada(); }
  async consultarEstado(_id: string): Promise<EstadoTransaccion> { return this.desactivada(); }
  async reembolsar(_id: string, _valorPesos?: number): Promise<{ id: string; estado: string }> { return this.desactivada(); }
}
