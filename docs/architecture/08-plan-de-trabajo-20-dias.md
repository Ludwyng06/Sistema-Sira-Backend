# SIRA - Plan de trabajo de 20 días

**Del martes 13 de octubre al domingo 1 de noviembre de 2026.** (El lunes 2 de noviembre es festivo.)

## 1. Cómo se reparte

Por **módulo de punta a punta**: cada persona hace el backend **y** el frontend de su módulo. Así nadie queda bloqueado esperando que "el del backend" termine el endpoint, y cada uno puede mostrar su parte funcionando.

| Integrante | Rol en el equipo | Semana 1 | Semana 2 | Semana 3 |
|---|---|---|---|---|
| **Jensen Ordóñez** | Líder técnico: integra, revisa PR, mantiene `develop` funcionando | Identidad (registro, verificación, login, roles, guardas) + configuración + bitácora | Aprobaciones (aval, aprobación, devolución, reclasificación) + motor de tarifas | Cotización en PDF + pagos por consignación + verificación de tesorería |
| **Isabel Cerón** | Dueña de la experiencia visual | Inventario completo (lo público lo deja Orca como ejemplo en la Fase 0 → completar CRUD de administración) + portal público por bloques + ficha del espacio | Asistente de solicitud (6 pasos) en el frontend | Actas de entrega y devolución + tablero de indicadores + pasada de accesibilidad |
| **Kevin Guerrero** | Dueño de la lógica de reservas | Disponibilidad: franjas, bloqueos, `GET /disponibilidad`, componente de calendario | Solicitudes en el backend: borrador, ítems, envío con retención (UC-01), máquina de estados | Vencimientos y recordatorios (jobs), correos, "Mis solicitudes", prueba de carrera |

> ⚠️ Reparto propuesto. Si alguien domina más el frontend o el backend, intercambien módulos, pero mantengan la regla de punta a punta.

## 2. Reglas de trabajo en equipo

- **Ramas:** flujo `main` + `develop`. Nadie trabaja directo en `main` ni en `develop`; `develop` siempre funciona. Cada tarea en una rama que sale de `develop`: `feat/<modulo>-<tarea>` (ej. `feat/inventario-fotos`), `fix/...` o `docs/...`. PR pequeño hacia `develop`, máximo dos días de vida. `develop` → `main` solo para entregas (por ejemplo, la demo del 1 de noviembre) y por PR.
- **Revisión:** todo PR lo aprueba alguien más. Jensen revisa los que tocan `schema.prisma` o `shared/`.
- **Cambios al esquema:** solo una persona a la vez modifica `schema.prisma` (se avisa en el grupo). Si dos migraciones chocan, gana la que se fusionó primero y la otra se regenera.
- **Commits:** en español con prefijo: `feat: carga de fotos de espacios`, `fix: aforo en la búsqueda inversa`, `docs: ...`.
- **Daily de 10 minutos** (WhatsApp o llamada): qué hice, qué haré, en qué estoy trabado.
- **Jueves de demo interna:** cada jueves se recorre el flujo completo en la máquina de alguien con `develop` limpio. Lo que no funcione ahí no está terminado.
- **Definición de terminado de una tarea:** endpoint con DTO validado y documentado en Swagger · regla de negocio con prueba unitaria · pantalla con sus cinco estados (cargando, vacío, datos, error, sin permiso) · funciona en 360 px · se puede usar con teclado.

## 3. Día a día

### Día 0 · Lunes 12 y martes 13 en la mañana · Jensen con Orca

- [ ] Ejecutar con Orca la **Fase 0** de `09-inicializacion-y-git.md`: los dos repositorios (backend y frontend), Docker, esquema, seed y módulo de inventario de ejemplo.
- [ ] Subir la base de cada repositorio a `main` y crear `develop` desde `main` (`develop` queda como rama por defecto); dar acceso a Isabel y Kevin.
- [ ] Proteger `main` y `develop` (PR obligatorio, 1 aprobación).
- [ ] Compartir el documento `07-cambios-documento-base.md` con el director para revisarlo esta semana.

### Semana 1 · Base e inventario (13 – 18 oct.)

**Martes 13 · Todos**
- [ ] Cada uno clona, corre `pnpm install`, `pnpm db:up`, `pnpm db:init` (solo uno, y sube la migración), `pnpm db:seed`, `pnpm dev`. Cada uno clona los dos repositorios (backend y frontend) y los levanta por separado. Todos deben ver el portal con los bloques de ejemplo y Swagger en `/docs`.
- [ ] Leer `01` a `04` y el módulo `inventario` que dejó la Fase 0 (es el ejemplo de cómo se escribe todo).
- [ ] Pedir a Vicerrectoría: planos, listado de espacios con capacidad, días de anticipación, quién aprueba (preguntas de `07` §D).

| | Jensen | Isabel | Kevin |
|---|---|---|---|
| Mié 14 | `POST /auth/registro` con consentimiento y detección de dominio. Argon2. | CRUD admin de sedes, bloques, tipos de espacio (back). | Servicio `DisponibilidadService.consultar(espacio, desde, hasta)` sobre `franja_ocupada`. |
| Jue 15 | Verificación de correo por código + Mailpit. Login, JWT y refresh rotativo. | CRUD admin de espacios y elementos (back). Archivar en vez de borrar. | `POST /bloqueos` con RRULE (librería `rrule`) que expande a franjas `BLOQUEO`. |
| Vie 16 | `RolesGuard`, `@Roles`, `@UsuarioActual`, alcance por dependencia. `GET /auth/yo`. | Portal: página del bloque (plano + espacios por piso + filtros + `IndicadorAforo`). | Componente `CalendarioEspacio` (FullCalendar: mes/semana/día, estados con patrón y etiqueta). |
| Sáb 17 | Pantallas `ingresar`, `registro`, `verificar-correo`. Cliente `api.ts` con refresco. | Ficha del espacio (galería, dotación, condiciones, tarifas, calendario de Kevin). | `GET /disponibilidad/buscar` (búsqueda inversa por aforo) + página `/buscar`. |
| Dom 18 | Interceptor de bitácora `@Auditar`. Layout del panel con menú por rol. | Carga de fotos (MinIO, variantes WebP con `sharp`, texto alternativo obligatorio). | Cargar en el seed los espacios reales si ya llegaron los planos. |

**Hito semana 1:** un visitante navega Mocoa → Bloque B → B-104 y ve fotos, aforo, dotación y el calendario con una clase bloqueada. Un usuario se registra con `@itp.edu.co`, verifica su correo y entra.

### Semana 2 · Calendario, solicitud y aprobación (19 – 25 oct.)

| | Jensen | Isabel | Kevin |
|---|---|---|---|
| Lun 19 | `TarifarioService.calcular()`: tarifa vigente, unidad más conveniente, recargos nocturno/dominical/festivo, IVA por concepto. | Asistente paso 1: selección de franjas en el calendario (clic/arrastre), validación de anticipación y aforo con sugerencias. | `POST /solicitudes` (borrador) + ítems de reserva y servicio. |
| Mar 20 | `POST /tarifas/calcular` + página del simulador. Pruebas de tarifas. | Pasos 2 y 3: servicios filtrados por tipo de espacio, datos del evento. Guardado automático del borrador. | `SolicitudStateMachine` con la tabla de transiciones y su prueba. |
| Mié 21 | `POST /solicitudes/:id/decisiones`: aval y aprobación, motivo obligatorio. | Paso 4: identificación (uso institucional o particular, dependencia, documentos). | **UC-01** `POST /solicitudes/:id/enviar`: validaciones + transacción + consecutivo + franjas `RETENIDA` + manejo de `23P01`. |
| Jue 22 | Bandeja de aprobación (lista priorizada + detalle con calendario y adjuntos). | Paso 5: resumen con desglose, o "$0 · valor de referencia". | Evaluación de RN-07 (exención) en el envío. Prueba de carrera de RNF-05. |
| **Jue 22** | **Demo interna:** un docente pide el auditorio, el responsable da el aval, el jefe aprueba → queda confirmada sin pasar por pago. | | |
| Vie 23 | Devolución (vuelve a borrador) y reclasificación. Recordatorio/escalamiento (consulta, sin job aún). | "Mis solicitudes" (lista con estado y próxima acción). | Carga de documentos adjuntos (MinIO) con validación de tipo y tamaño. |
| Sáb 24 | Cotización: generación con consecutivo `COT-` y desglose congelado (sin PDF aún). | Detalle de solicitud: línea de tiempo de estados. | Cancelación por el solicitante (libera franjas; reembolso queda para la etapa 2). |
| Dom 25 | Corrección de bugs de la demo del jueves. | Corrección de bugs. | Corrección de bugs. |

**Hito semana 2:** el recorrido del docente (exento) funciona completo. Una empresa puede enviar una solicitud y recibir la aprobación. Dos solicitudes sobre la misma franja: la segunda recibe "El espacio ya está ocupado" con sugerencias.

### Semana 3 · Cotización, pago, actas y panel (26 oct. – 1 nov.)

| | Jensen | Isabel | Kevin |
|---|---|---|---|
| Lun 26 | PDF de cotización tamaño carta (`pdfmake` o `@react-pdf/renderer`). | Acta de entrega: checklist desde los elementos del espacio, fotos con cámara del celular. | Job de vencimientos (revisión y pago) que libera franjas. |
| Mar 27 | `POST /pagos/ordenes` (consignación) + paso 6 del asistente: cuenta, referencia, carga de soporte. | Acta de devolución con novedades y valor del daño. | Job de recordatorios (aprobador 24 h / 48 h, evento 48 h / 24 h). |
| Mié 28 | Pantalla de tesorería: por verificar, comparar soporte, aprobar o rechazar → confirmada. | Tablero: ocupación, solicitudes por estado, recaudo, tiempo medio de aprobación, uso interno no cobrado. | Plantillas de correo para cada cambio de estado + centro de notificaciones. |
| **Jue 29** | **Demo interna completa:** docente (exento) y empresa (consignación) de punta a punta, hasta el acta de devolución. | | |
| Vie 30 | Panel de bitácora (filtros). Usuarios y roles en configuración. | Pasada de accesibilidad (teclado, contraste, alt, foco) y de 360 px. | Pruebas e2e de UC-01 a UC-03. |
| Sáb 31 | Despliegue de demostración. Seed con datos reales. | Pulido visual, estados vacíos y de error. | Corrección de bugs. |
| Dom 1 | **Congelamiento.** Ensayo de la demo con el guion. Nada nuevo después del mediodía. | | |

## 4. Guion de la demo de entrega (10 minutos)

1. **El problema** (1 min): correo + Excel de la Vicerrectoría.
2. **El portal** (2 min): Inicio → Bloque A → plano → espacios por piso con aforo. Buscar "40 personas, viernes 2 a 6 p. m." → sugiere un aula, no el auditorio.
3. **Docente** (2 min): pide el auditorio para un evento del programa → el responsable da el aval → el jefe aprueba → **confirmada sin pago**, con valor de referencia.
4. **Empresa** (3 min): pide la cancha → aprobada → cotización en PDF → consigna y sube el soporte → tesorería verifica → confirmada → acta de entrega en el celular → acta de devolución con una novedad.
5. **Lo que no se puede romper** (1 min): dos personas piden la misma franja al mismo tiempo → solo una lo logra. La bitácora muestra quién hizo qué.
6. **Lo que sigue** (1 min): pasarela, factura electrónica y lo que resta del roadmap.

## 5. Si el tiempo no alcanza, se recorta en este orden

1. Recordatorios automáticos (se dejan solo los correos de cambio de estado).
2. PDF de cotización (se muestra la cotización en pantalla).
3. Tablero de indicadores (se deja solo el conteo por estado).
4. Fotos en el acta.

**No se recorta nunca:** la restricción de no solapamiento, la máquina de estados, el flujo exento sin pasarela y la autorización por recurso.
