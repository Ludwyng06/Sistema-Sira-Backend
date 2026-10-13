/**
 * Puerto de pasarela de pago (documento base §9.4).
 *
 * ETAPA 2 — no se implementa en el avance de 20 días. Se deja definido para
 * que el módulo de reservas nunca dependa de un proveedor concreto.
 *
 * Diferencia con el documento base: SIRA guarda pesos enteros; la conversión
 * a centavos (valor * 100) la hace CADA ADAPTADOR, no el dominio.
 *
 * Adaptadores previstos: WompiAdapter, EpaycoAdapter, BoldAdapter, EcollectAdapter,
 * o el de la plataforma existente pagos.uniputumayo.edu.co (⚠️ por confirmar).
 */

export type EstadoTransaccion = 'APROBADA' | 'RECHAZADA' | 'PENDIENTE' | 'ANULADA' | 'ERROR';

export interface CrearTransaccionEntrada {
  /** Referencia única de la OrdenPago (OP-2026-000123). Nunca se reutiliza. */
  referencia: string;
  /** En PESOS enteros. El adaptador convierte a lo que pida el proveedor. */
  valorPesos: number;
  moneda: 'COP';
  correoPagador: string;
  urlRetorno: string;
  descripcion: string;
}

export interface EventoInterpretado {
  idEventoExterno: string;
  referencia: string;
  estado: EstadoTransaccion;
  valorPesos: number;
  transaccionExternaId: string;
  ocurrioEn: Date;
}

export interface PasarelaPort {
  readonly proveedor: string;

  crearTransaccion(
    entrada: CrearTransaccionEntrada,
  ): Promise<{ urlCheckout: string; transaccionExternaId: string }>;

  /** RF-PAG-04: se valida ANTES de procesar el evento, con el cuerpo crudo. */
  verificarFirmaWebhook(cuerpoCrudo: string, cabeceras: Record<string, string>): boolean;

  interpretarEvento(cuerpo: unknown): EventoInterpretado;

  /** RF-PAG-06: consulta activa para PSE que se quedan pendientes. */
  consultarEstado(transaccionExternaId: string): Promise<EstadoTransaccion>;

  reembolsar(transaccionExternaId: string, valorPesos?: number): Promise<{ id: string; estado: string }>;
}

/** Token de inyección: `@Inject(PASARELA) private readonly pasarela: PasarelaPort` */
export const PASARELA = Symbol('PASARELA');
