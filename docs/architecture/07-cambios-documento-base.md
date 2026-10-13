# SIRA - Cambios respecto al documento base v1.0

> Para revisar con el director del programa. El documento base (*SIRA · Documento base de requisitos v1.0*, 4 sep. 2026) sigue siendo la referencia. Aquí se registra cada punto donde la implementación **precisa, corrige o completa** algo, con su razón. Nada de esto cambia el alcance ni los actores.
>
> Estado: ⏳ por revisar · ✅ aprobado por el director · ❌ rechazado (se vuelve a lo del documento base).

## A. Correcciones de inconsistencias internas del documento

| # | Dónde | Qué decía | Qué se implementa | Por qué | Estado |
|---|---|---|---|---|---|
| H1 | RN-02 vs. RF-APR-06 | Retención de 48 h desde el envío. Escalamiento al superior a las 72 h. | Dos plazos: **revisión 72 h** (recordatorio a las 24 h, escalamiento a las 48 h) y **pago 48 h** desde que queda cotizada. | Con el texto original la solicitud se vencía antes de que se escalara. Y un aprobador lento le quitaba el horario a un externo que nunca tuvo la oportunidad de pagar. | ⏳ |
| H2 | Ciclo de vida, §6 | `Pago pendiente → Vencida`, sin más. | Una orden con transacción PSE pendiente no vence (gracia de 120 min). Si llega un pago aprobado para una solicitud ya vencida: se confirma si la franja sigue libre; si no, reembolso total automático y aviso a tesorería. | El mismo documento advierte (§11.1) que un PSE puede aprobarse minutos después. Sin esta regla, la institución cobraría un espacio que ya entregó a otro. | ⏳ |
| H3 | §9.1, SQL de exclusión | `reserva_item` con columnas `inicio`, `fin`, `estado`, que la entidad (§4.2) no tiene (tiene `fecha`, `hora_inicio`, `hora_fin`). | `reserva_item` con `inicio`/`fin` (timestamptz). La restricción se pone en una **tabla única de ocupación** (`franja_ocupada`) donde también viven clases, mantenimientos y festivos. | La restricción sobre `reserva_item` no protege contra clases ni mantenimientos (RN-03), porque una restricción de exclusión no cruza tablas. Con la tabla única, **nada** se puede solapar. Probado con una prueba de carrera. | ⏳ |
| H3b | RF-CAL-12 | Montaje y desmontaje "bloquean la franja contigua". | La franja ocupada incluye montaje y desmontaje, así la restricción también los protege. | De lo contrario, otra reserva podía quedar pegada sin tiempo de montaje. | ⏳ |
| H5 | RN-10 vs. tabla 5.1 | RN-10: interno con fin particular paga "tarifa externa". Tabla 5.1: "tarifa persona natural". | **Tarifa persona natural**. | Eran dos respuestas distintas a la misma pregunta. Se toma la de la tabla porque "externa" no es un tipo de tarifa (hay persona, empresa y entidad). | ⏳ |
| H5b | RN-07 y tabla 5.1 | "Si alguna condición falla, se procesa como externa y sí cobra" / "$0 provisional hasta que se niegue el aval". | Si el aval se **niega**, la solicitud **se rechaza** con el motivo. El interno decide si la reenvía como uso particular. | Convertir en cobro automáticamente algo que la persona pidió como institucional sorprende al usuario y genera cobros no consentidos. La reclasificación explícita del aprobador (RF-APR-05) sí se mantiene. | ⏳ |
| H6 | RN-07(d) vs. §14 | Aval del **jefe** de la dependencia / estudiantes con aval de **un docente**. | Para estudiantes el aval lo da un docente o el jefe del programa; luego sigue la aprobación normal. | Las dos reglas no podían cumplirse a la vez. | ⏳ |
| H7 | Matriz §3.2 | Solicitante: solo `L` sobre pagos. | Solicitante: `C` y `L` sobre **sus** pagos. | Necesita generar su orden y cargar el soporte de consignación (RF-PAG-07). | ⏳ |
| H9 | §6, acción "devolver" | RF-APR-02 menciona "devolver con observaciones" pero no hay estado destino. | "Devuelta" regresa la solicitud a **Borrador** y libera el horario. | Para que el solicitante pueda corregir y reenviar. | ⏳ |

## B. Decisiones técnicas que precisan el documento

| # | Tema | Documento base | Implementación | Por qué | Estado |
|---|---|---|---|---|---|
| T1 | Dinero | Enteros de **centavos**. | Enteros de **pesos**; ×100 solo al hablar con la pasarela. | El peso colombiano no maneja decimales (RNF-13). Se cumple la intención (nunca punto flotante) y se evita `BigInt`, que JSON no serializa. | ⏳ |
| T2 | Versiones | Next.js 15. | Next.js 16 (estable actual). NestJS 12, Prisma 7. | Son las estables de octubre de 2026. No cambia el diseño. | ⏳ |
| T3 | Arquitectura hexagonal | En todo el backend. | Puertos y adaptadores donde hay proveedores intercambiables (**pagos**, almacenamiento, correo). El resto, servicios de NestJS. | Equipo de tres, 20 días, primer proyecto con NestJS. La regla que importa (lógica en servicios, no en controladores, RNF-16) se mantiene. | ⏳ |
| T4 | Consecutivos | Únicos y secuenciales (RN-17). | Tabla `consecutivo` incrementada dentro de la transacción. | Las secuencias de PostgreSQL dejan huecos con cada rollback. | ⏳ |
| T5 | Línea de tiempo (RF-CAL-10) | FullCalendar o Schedule-X. | FullCalendar estándar; la línea de tiempo por espacios se construye propia. | La vista de recursos de FullCalendar es de pago. | ⏳ |

## C. Aportes del equipo (a partir de la reunión con Vicerrectoría)

| # | Aporte | Cómo encaja con el documento base | Estado |
|---|---|---|---|
| E1 | **Navegación por bloques.** Sede → Bloque A/B/C → piso → espacio, con la numeración de los planos oficiales, en lugar de un buscador con todos los espacios. | La jerarquía ya está en §4.1; se agrega `plano_url`, `piso` y `codigo` según plano. Es la forma de presentar el inventario. | ⏳ |
| E2 | **Capacidad siempre visible y sugerencias.** Además de bloquear cuando el aforo supera la capacidad (RN-18), advertir cuando el espacio es demasiado grande para el grupo y sugerir alternativas. | Extiende RN-18 con una advertencia no bloqueante. | ⏳ |
| E3 | **Anticipación de ~2 días** para espacios que requieren montaje (auditorios), según Vicerrectoría. | RN-04 sugería 8 días hábiles. Queda **configurable por tipo de espacio** con 2 días por defecto, a confirmar con Vicerrectoría. | ⏳ |
| E4 | **Pago por consignación como primer medio**, que es como funciona hoy. | Ya estaba en RF-PAG-07; se adelanta al avance y la pasarela pasa a la etapa 2 (como prevé la mitigación del riesgo 2, §13). | ⏳ |

## D. Preguntas abiertas para Vicerrectoría y Tesorería

1. ¿Quién aprueba qué? Hoy todo llega a la Vicerrectoría. ¿Es aprobadora de todas las solicitudes, solo de las externas, o la aprobación queda en cada dependencia dueña (como propone §14)?
2. La universidad ya tiene **`pagos.uniputumayo.edu.co`** (enlace "Pago en línea" del sitio). ¿Qué proveedor es? ¿SIRA puede generar referencias de pago allí? Eso podría reemplazar la negociación de una pasarela nueva.
3. ¿Existe ya un acuerdo de tarifas para espacios? ¿Número y fecha?
4. ¿Los planos con la numeración oficial de los bloques A, B y C, y el listado de espacios con su capacidad?
5. ¿Cuántos días de anticipación exactos para auditorio y escenarios deportivos?
6. ¿Número de cuenta de recaudo y formato de referencia que pide tesorería para identificar una consignación?
