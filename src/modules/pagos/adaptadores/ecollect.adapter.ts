import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorDominio } from '../../../shared/errores/error-dominio.js';
import type { CrearTransaccionEntrada, EstadoTransaccion, EventoInterpretado, PasarelaPort } from '../puertos/pasarela.port.js';

function xml(valor: string): string {
  return valor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Integración pendiente del WSDL y convenio oficial del comercio.
 * Fuente oficial que confirma SOLO el fragmento EntityCode/TicketId de consulta:
 * https://qa.e-collect.com/qa_manuales/Manuales/ecollectManualdeProducto.html
 * no verificado: createTransactionPayment, autenticación/sesión/token, SOAPAction,
 * namespace, respuesta/estados, unidad monetaria, confirmación/firma, reembolsos y
 * endpoints de test/prod. No confundir con ecollect.org (otro proveedor).
 * Variables previstas: ECOLLECT_AMBIENTE, ECOLLECT_ENTITY_CODE, ECOLLECT_SRV_CODE,
 * ECOLLECT_API_KEY, ECOLLECT_URL_API. Ninguna habilita tráfico sin ese contrato.
 */
@Injectable()
export class EcollectAdapter implements PasarelaPort {
  readonly proveedor = 'ECOLLECT' as const;
  constructor(private readonly config: ConfigService) {}

  private ambiente(): 'test' | 'prod' {
    const ambiente = this.config.get<string>('ECOLLECT_AMBIENTE') || 'test';
    if (ambiente !== 'test' && ambiente !== 'prod') {
      throw new ErrorDominio('PASARELA_SIN_CONFIGURAR', 'ECOLLECT_AMBIENTE debe ser test o prod.', 503);
    }
    return ambiente;
  }

  private noVerificado(operacion: string): never {
    this.ambiente();
    throw new ErrorDominio('INTEGRACION_NO_VERIFICADA',
      `eCollect: ${operacion} no verificado; se requiere el contrato oficial del convenio (WSDL, sesión/token, ambientes y confirmación).`, 501);
  }

  /** Fragmento documentado, NO sobre SOAP ni petición HTTP sin verificar. */
  prepararConsulta(id: string): string {
    this.ambiente();
    const entidad = this.config.get<string>('ECOLLECT_ENTITY_CODE');
    if (typeof entidad !== 'string' || !entidad.trim()) {
      throw new ErrorDominio('PASARELA_SIN_CONFIGURAR', 'Falta el código de entidad eCollect.', 503);
    }
    // XML 1.0: no permitir controles, sustitutos aislados ni inyección de etiquetas.
    const textoValido = (valor: unknown): valor is string => typeof valor === 'string' && !!valor.trim() &&
      !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff\ud800-\udfff]/u.test(valor);
    if (!textoValido(entidad) || !textoValido(id)) {
      throw new ErrorDominio('CONSULTA_INVALIDA', 'La entidad o el TicketId de eCollect no es válido.', 422);
    }
    return `<getTransactionInformation><request><EntityCode>${xml(entidad)}</EntityCode><TicketId>${xml(id)}</TicketId></request></getTransactionInformation>`;
  }

  async crearTransaccion(entrada: CrearTransaccionEntrada): Promise<{ urlCheckout: string; transaccionExternaId: string | null }> {
    if (entrada.moneda !== 'COP' || !Number.isSafeInteger(entrada.valorPesos) || entrada.valorPesos <= 0) {
      throw new ErrorDominio('VALOR_INVALIDO', 'El valor del pago no es válido.', 422);
    }
    return this.noVerificado('createTransactionPayment');
  }

  verificarFirmaWebhook(_crudo: string, _cabeceras: Record<string, string>): boolean {
    // no verificado: no existe algoritmo de firma confirmado; jamás aceptar por API_KEY.
    return false;
  }

  interpretarEvento(_cuerpo: unknown): EventoInterpretado {
    return this.noVerificado('esquema y autenticidad de la confirmación');
  }

  async consultarTransaccion(id: string): Promise<EventoInterpretado> {
    this.prepararConsulta(id);
    return this.noVerificado('transporte, autenticación y respuesta de getTransactionInformation');
  }

  async consultarPorReferencia(_referencia: string): Promise<EventoInterpretado | null> {
    // No convertir OP en TicketId: la equivalencia no está documentada.
    return this.noVerificado('consulta por referencia de la orden');
  }

  async consultarEstado(id: string): Promise<EstadoTransaccion> {
    return (await this.consultarTransaccion(id)).estado;
  }

  async reembolsar(_id: string, _valorPesos?: number): Promise<{ id: string; estado: string }> {
    return this.noVerificado('reembolso');
  }
}
