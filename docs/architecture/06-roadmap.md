# SIRA - Roadmap

El documento base estima 20 semanas para la versión 1 completa. El equipo tiene **20 días** para un gran avance. Este roadmap reordena las fases del documento base para que el avance sea un sistema que funciona de punta a punta, y deja para después lo que depende de terceros (pasarela, facturación) o es pulido.

La lógica del orden: primero lo que **más incertidumbre elimina** (el modelo de datos con la restricción de no solapamiento y la máquina de estados), después lo que **más se ve en la demo** (el portal por bloques y el flujo de solicitud) y al final lo que **depende de otros** (convenio de recaudo, proveedor de factura).

## Etapa 1 · Avance de 20 días (13 oct. – 1 nov. 2026)

Detalle día a día y reparto en `08-plan-de-trabajo-20-dias.md`.

| Semana | Fechas | Resultado visible |
|---|---|---|
| 1 · Base e inventario | 13 – 18 oct. | Login con verificación de correo y roles. Portal público navegable por sede → bloque → espacio con fotos, capacidad y dotación reales. |
| 2 · Calendario, solicitud y aprobación | 19 – 25 oct. | Calendario con disponibilidad real. Un solicitante arma y envía una solicitud; el responsable da el aval y el aprobador aprueba, rechaza o devuelve. Flujo exento completo. |
| 3 · Cotización, pago, actas y panel | 26 oct. – 1 nov. | Cotización en PDF, pago por consignación verificado por tesorería, actas de entrega y devolución, tablero con indicadores, bitácora. Demo ensayada. |

**Criterio de terminado del avance:** se puede hacer, en vivo y sin tocar la base de datos, el recorrido completo de un **docente** (uso institucional exento) y de una **empresa** (paga por consignación), desde buscar el espacio hasta cerrar con acta de devolución, y mostrar que dos solicitudes sobre la misma franja no pueden coexistir.

## Etapa 2 · Cierre de la versión 1 (después de la entrega)

| Fase | Contenido | Depende de |
|---|---|---|
| 2.1 Pasarela | `PasarelaPort`, adaptador del proveedor elegido, webhooks idempotentes, consulta activa, conciliación diaria. | ⚠️ Saber si se usa la plataforma existente `pagos.uniputumayo.edu.co` o un convenio nuevo (tesorería). |
| 2.2 Factura electrónica | Adaptador al proveedor tecnológico de la institución. | Saber qué proveedor usa la institución. |
| 2.3 Cancelaciones y reembolsos | RN-14 completa, reembolsos parciales, reprogramación. | 2.1 |
| 2.4 Servicios completos | Confirmación del proveedor por enlace, agenda por proveedor, restricciones por tipo de espacio. | |
| 2.5 Operación | Firma táctil en actas, depósitos y cobro de daños, recordatorios por WhatsApp. | |
| 2.6 Importaciones | Inventario masivo por CSV/XLSX, horario académico por CSV con reporte de conflictos. | Formato del horario que entregue Planeación/Registro. |
| 2.7 Seguridad y acceso | Segundo factor para admin y tesorería, inicio de sesión con Google/Microsoft institucional. | Saber qué directorio usa la institución. |
| 2.8 Cierre | Auditoría de accesibilidad AA, pruebas de carga con k6, pruebas de seguridad, manuales, capacitación, despliegue. | |

## Etapa 3 · Versiones futuras

Mapa de calor de ocupación, depreciación de elementos, paquetes preconfigurados (grado = auditorio + sonido + coro), códigos QR por espacio, exportación iCal, delegación de aprobación, integración contable por API.

## Riesgos de este roadmap

| Riesgo | Mitigación |
|---|---|
| 20 días es poco para tres personas aprendiendo NestJS 12 y Next 16. | El módulo `inventario` se construye primero (Fase 0 de `09`) como ejemplo para copiar. Alcance del avance sin pasarela. Reparto por módulos de punta a punta para no esperarse entre sí. |
| Los planos y la numeración de los salones no llegan a tiempo. | El seed trae datos de ejemplo con la estructura correcta; cargar los reales es solo cambiar datos. Pedirlos a Vicerrectoría el primer día. |
| Diferencias con el documento del director. | Todo cambio queda en `07-cambios-documento-base.md` para revisarlo con él en la primera semana, no el día de la entrega. |
| Integración de último momento. | Integración continua: se fusiona a `develop` todos los días, y el jueves de cada semana hay demo interna del recorrido con `develop`. |
