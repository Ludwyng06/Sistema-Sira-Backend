/**
 * Totales de una solicitud (RN-05). Una sola fuente de verdad: la comparten la cotización
 * (`decisiones.service`) y el estimado del borrador (`solicitudes.service`).
 */
export interface ConceptoEspacio {
  base: number;
  recargos: number;
  subtotal: number;
  iva: number;
}

/** Una franja con los datos de depósito de su espacio (RF-TAR-09: el depósito es por espacio). */
export interface FranjaCalculada extends ConceptoEspacio {
  espacioId: string;
  depositoValorFijo: number | null;
  depositoPorcentaje: number;
}

export interface Totales {
  base: number;
  recargos: number;
  subtotal: number;
  iva: number;
  deposito: number;
  total: number;
}

const suma = (valores: number[]): number => valores.reduce((a, b) => a + b, 0);

/**
 * Depósito de garantía por espacio distinto: valor fijo (una vez por espacio, no por franja) más el
 * porcentaje sobre el subtotal de las franjas de ESE espacio (con recargos, sin IVA ni servicios).
 */
export function calcularDeposito(franjas: readonly FranjaCalculada[]): number {
  const porEspacio = new Map<string, { fijo: number; porcentaje: number; subtotal: number }>();
  for (const f of franjas) {
    const actual = porEspacio.get(f.espacioId) ?? {
      fijo: f.depositoValorFijo ?? 0,
      porcentaje: f.depositoPorcentaje,
      subtotal: 0,
    };
    actual.subtotal += f.subtotal;
    porEspacio.set(f.espacioId, actual);
  }
  return suma([...porEspacio.values()].map((e) => e.fijo + Math.round((e.subtotal * e.porcentaje) / 100)));
}

/**
 * `subtotalServicios` es cantidad × tarifa de cada servicio (sin recargos) e `ivaServicios` es el IVA
 * calculado sobre los servicios gravados (RF-TAR-07). El depósito va aparte del total.
 */
export function totalizarSolicitud(
  franjas: readonly FranjaCalculada[],
  subtotalServicios: number,
  ivaServicios: number = 0,
): Totales {
  const subtotal = suma(franjas.map((f) => f.subtotal)) + subtotalServicios;
  const iva = suma(franjas.map((f) => f.iva)) + ivaServicios;
  return {
    base: suma(franjas.map((f) => f.base)) + subtotalServicios,
    recargos: suma(franjas.map((f) => f.recargos)),
    subtotal,
    iva,
    deposito: calcularDeposito(franjas),
    total: subtotal + iva,
  };
}

const dosDecimales = (valor: number): number => Math.round(valor * 100) / 100;

export interface ResumenItemReserva<U extends string = string> {
  unidad: U | null;
  cantidad: number;
  valorUnitario: number;
  recargos: number;
  subtotal: number;
}

/** Valores que se guardan/muestran en un ítem de reserva a partir del cálculo del tarifario. */
export function resumirItemReserva<U extends string>(calculo: {
  lineas: { cantidad: number; unidad: U | 'JORNADAS' }[];
  base: number;
  recargos: number;
  subtotal: number;
}): ResumenItemReserva<U> {
  const cantidad = calculo.lineas.reduce((s, l) => s + l.cantidad, 0);
  const unidades = new Set(calculo.lineas.map((l) => l.unidad));
  const unica = unidades.size === 1 ? [...unidades][0]! : null;
  return {
    unidad: unica && unica !== 'JORNADAS' ? (unica as U) : null,
    cantidad: dosDecimales(cantidad),
    valorUnitario: cantidad > 0 ? Math.round(calculo.base / cantidad) : 0,
    recargos: calculo.recargos,
    subtotal: calculo.subtotal,
  };
}
