import type { EstadoSolicitud } from '../../../generated/prisma/enums.js';

/**
 * Máquina de estados de la solicitud (docs/architecture/02-data-model.md §4).
 *
 * ÚNICA fuente de verdad de qué transiciones existen. Ningún servicio cambia
 * `solicitud.estado` sin pasar por `validarTransicion`. Si hace falta una
 * transición nueva, se agrega aquí con su prueba y se documenta en 02.
 */

export type EventoSolicitud =
  | 'ENVIAR'
  | 'ENRUTAR'
  | 'APROBAR'
  | 'APROBAR_EXENTA'
  | 'RECHAZAR'
  | 'DEVOLVER'
  | 'GENERAR_ORDEN_PAGO'
  | 'CONFIRMAR_PAGO'
  | 'CONFIRMAR_PAGO_TARDIO'
  | 'VENCER'
  | 'ENTREGAR'
  | 'DEVOLVER_ESPACIO'
  | 'CERRAR'
  | 'CANCELAR'
  | 'REEMBOLSAR';

/** [estado origen, evento] → estado destino */
const TRANSICIONES: Record<EstadoSolicitud, Partial<Record<EventoSolicitud, EstadoSolicitud>>> = {
  BORRADOR: { ENVIAR: 'ENVIADA' },
  ENVIADA: { ENRUTAR: 'EN_REVISION', VENCER: 'VENCIDA' },
  EN_REVISION: {
    APROBAR: 'COTIZADA',
    RECHAZAR: 'RECHAZADA',
    DEVOLVER: 'BORRADOR',
    VENCER: 'VENCIDA',
  },
  COTIZADA: {
    GENERAR_ORDEN_PAGO: 'PAGO_PENDIENTE',
    APROBAR_EXENTA: 'CONFIRMADA',
    VENCER: 'VENCIDA',
  },
  PAGO_PENDIENTE: { CONFIRMAR_PAGO: 'CONFIRMADA', VENCER: 'VENCIDA' },
  // RN-02d: pago tardío con la franja todavía libre.
  VENCIDA: { CONFIRMAR_PAGO_TARDIO: 'CONFIRMADA' },
  CONFIRMADA: { ENTREGAR: 'EN_USO', CANCELAR: 'CANCELADA' },
  EN_USO: { DEVOLVER_ESPACIO: 'FINALIZADA' },
  FINALIZADA: { CERRAR: 'CERRADA' },
  CANCELADA: { REEMBOLSAR: 'REEMBOLSADA' },
  RECHAZADA: {},
  CERRADA: {},
  REEMBOLSADA: {},
};

/** Estados en los que la solicitud retiene o tiene franjas activas en el calendario. */
export const ESTADOS_CON_FRANJA_ACTIVA: readonly EstadoSolicitud[] = [
  'ENVIADA',
  'EN_REVISION',
  'COTIZADA',
  'PAGO_PENDIENTE',
  'CONFIRMADA',
  'EN_USO',
];

/** Estados terminales: nada más puede pasar. */
export const ESTADOS_TERMINALES: readonly EstadoSolicitud[] = ['RECHAZADA', 'CERRADA', 'REEMBOLSADA'];

export class TransicionInvalida extends Error {
  constructor(
    public readonly desde: EstadoSolicitud,
    public readonly evento: EventoSolicitud,
  ) {
    super(`La solicitud en estado ${desde} no admite la acción ${evento}.`);
    this.name = 'TransicionInvalida';
  }
}

/** Devuelve el estado destino o lanza TransicionInvalida. */
export function validarTransicion(desde: EstadoSolicitud, evento: EventoSolicitud): EstadoSolicitud {
  const destino = TRANSICIONES[desde][evento];
  if (!destino) throw new TransicionInvalida(desde, evento);
  return destino;
}

/** Eventos disponibles en un estado (para mostrar botones en la interfaz). */
export function eventosPermitidos(desde: EstadoSolicitud): EventoSolicitud[] {
  return Object.keys(TRANSICIONES[desde]) as EventoSolicitud[];
}
