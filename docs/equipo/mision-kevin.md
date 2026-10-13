# SIRA · Misión del agente de Kevin Guerrero · FRONTEND

> Pega este archivo completo como contexto inicial de tu agente de programación, junto con `PROMPT-MAESTRO.md`.
> Cubre los 20 días (13 oct. – 1 nov. 2026). **Reemplaza el reparto por módulos de `docs/architecture/08-plan-de-trabajo-20-dias.md`**: ahora el reparto es por repositorio.
> Documento hermano: `docs/equipo/mision-isabel.md` (backend).

## 1. Tu papel

Eres el dueño de **todo el frontend** (`Sistema-Sira-Frontend`). Isabel es la dueña de **todo el backend** (`Sistema-Sira-Backend`). Jensen es el líder técnico: revisa los pull request, mantiene la documentación y decide lo que este documento no resuelva.

**Así no chocan:** tú solo escribes en el repo Frontend e Isabel solo en el repo Backend. Lo único que cruza entre los dos es **el contrato de la API**, que Isabel publica en Swagger (sección 4).

## 2. Antes de empezar

1. Lee `PROMPT-MAESTRO.md`, `docs/architecture/04-frontend.md` completo y `03-backend.md` §5 y §6 (endpoints y errores).
2. **Next.js 16 no es el que conoces.** Antes de usar una API nueva, lee `node_modules/next/dist/docs/` (lo exige `AGENTS.md`). El proyecto tiene `cacheComponents: true`: el dato dinámico va en un componente hijo dentro de `<Suspense>`. Copia el patrón de `src/app/(publico)/page.tsx`.
3. Requisitos: Node.js 22.22.3 o superior, Docker Desktop, Git, puerto 5432 libre.
4. Arranque. Necesitas los dos repos clonados lado a lado; el backend **solo lo levantas, nunca lo editas**:

   ```bash
   # Backend (cada mañana, en develop)
   git pull && npm install
   npm run db:up && npm run db:migrate && npm run db:seed
   npm run dev                      # http://localhost:3001/docs

   # Frontend
   npm install && cp .env.example .env.local
   npm run start                    # http://localhost:3000
   ```
5. Tu rama es `feature/kevin` **en el repo Frontend**. Nunca trabajas en `main` ni en `develop`.

## 3. Tu territorio

| Editas | No tocas |
|---|---|
| Todo `src/**` del repo Frontend: `app/`, `components/`, `lib/`. | El repo `Sistema-Sira-Backend`, ni un archivo. Si te falta un campo o un endpoint, se lo pides a Isabel (sección 4). |
| `public/**`, `next.config.ts`, `eslint.config.mjs`. | `docs/**` y `PROMPT-MAESTRO.md`: los mantiene Jensen y se copian desde el Backend. |
| `.env.example` (toda variable nueva). | `cacheComponents` en `next.config.ts`: no se desactiva. |
| `package.json` (dependencia nueva: di para qué y qué alternativa descartaste, en un PR aparte). | |

Lo que ya existe y es tuyo desde hoy: las páginas públicas (`/`, `/sedes/[sede]/bloques/[bloque]`, `/espacios/[codigo]`), los componentes base, `src/lib/api.ts`, `formato.ts`, `inventario.ts` y `tipos.ts`.

## 4. El contrato con Isabel: contrato primero

Tú construyes **un paso detrás de Isabel**. Ella publica el contrato de cada módulo antes de implementarlo, así que tú puedes escribir la pantalla aunque el endpoint todavía responda `501`.

1. **Swagger es la única fuente del contrato:** `http://localhost:3001/docs` (JSON en `/docs-json`). No inventes campos ni rutas.
2. **Tus tipos salen de Swagger.** Un archivo por módulo: `src/lib/tipos-<modulo>.ts` (por ejemplo `tipos-solicitudes.ts`) y sus llamadas en `src/lib/<modulo>.ts`. Todo fetch pasa por `src/lib/api.ts`.
3. **Si el endpoint aún responde `501`:** la pantalla se construye completa contra los tipos, y muestra su estado de error mientras tanto. Nunca dejes un mock ni datos quemados en el repo.
4. **Si te falta algo** (un campo, un filtro, un endpoint): abre un issue en el repo Backend con la etiqueta `contrato`, diciendo qué pantalla lo necesita y qué forma esperas. No lo resuelvas calculándolo en el cliente.
5. **Si Isabel cambia un contrato publicado**, avisa en el grupo y su PR dice "CAMBIO DE CONTRATO". Ajustas tus tipos ese mismo día.

Reglas de forma de toda la API:

- Paginación `?pagina&porPagina` → `{ datos, total, pagina, porPagina }`.
- Errores `{ codigo, mensaje, detalles?, correlacionId }`: muestras `mensaje` tal cual llega (ya viene escrito para el usuario).
- Fechas ISO 8601 en UTC: las formateas con `src/lib/formato.ts`, siempre en `America/Bogota`. Dinero en pesos enteros: `pesos()`.
- `404` en un recurso ajeno o inexistente → página de no encontrado.
- Sesión: el access token vive en memoria (`fijarToken`); el refresh llega en cookie `httpOnly`; `api.ts` ya reintenta tras un `401`.

## 5. Tareas en orden

Cada fila es un PR pequeño hacia `develop`. ⏬ = recortable si el tiempo no alcanza.

### Semana 1 · Portal, acceso y panel (13–18 oct.)

| Día | Tarea | Se acepta cuando |
|---|---|---|
| Mar 13 | Levantar los dos proyectos. Leer la guía de Next 16 y recorrer el código existente. | Ves Mocoa con los bloques A, B y C. |
| Mié 14 | Portal público (el backend ya existe): filtro por capacidad mínima en el bloque, galería y condiciones en la ficha, páginas `/servicios` y `/ayuda` de lugar. | Con `?asistentes=` se atenúan los que no caben y se advierte donde sobra espacio. |
| Jue 15 | Pantallas `registro` (por tipo de solicitante, con aceptación de la política de datos) y `verificar-correo`. | Si el envío falla no se borra lo escrito; el mensaje de error es el de la API. |
| Vie 16 | `ingresar`, `recuperar`, `restablecer`. Sesión: token en memoria, refresco, `GET /auth/yo`, protección en el servidor de `(cuenta)` y `(panel)`. | Sin sesión, las rutas protegidas llevan a `/ingresar`; sin rol, "No tienes acceso a esta sección". |
| Sáb 17 | Layout del panel con menú según los roles. Administración de inventario: árbol sede → bloque → espacio a la izquierda, formulario a la derecha. | Archivar pide confirmación (`DialogoConfirmacion`); nada dice "eliminar". |
| Dom 18 | Componente `CalendarioEspacio` (FullCalendar: mes, semana, día) con estados por color, patrón y etiqueta. Calendario en la ficha del espacio. Página `/buscar` (búsqueda inversa). | El estado nunca se comunica solo con color; en celular pasa a lista por día; se usa con teclado. |

**Hito:** un visitante navega Mocoa → Bloque B → un espacio y ve aforo, dotación y el calendario con una clase bloqueada. Un usuario se registra, verifica su correo y entra.

### Semana 2 · Solicitud y aprobación (19–25 oct.)

| Día | Tarea | Se acepta cuando |
|---|---|---|
| Lun 19 | Bloqueos del panel (`panel/calendario`: manuales y recurrentes). ⏬ Carga de fotos (`CargadorArchivos`, texto alternativo obligatorio). | Un bloqueo que choca muestra el mensaje del `409`. |
| Mar 20 | Asistente paso 1: selección de franjas en el calendario (clic o arrastre), validación inmediata de anticipación y aforo con sugerencias. Paso 2: servicios filtrados por tipo de espacio. | El aforo mayor a la capacidad bloquea y sugiere; nada se retiene todavía. |
| Mié 21 | Pasos 3 y 4: datos del evento, identificación (uso institucional o particular, dependencia, documentos). Guardado automático del borrador. | Recargar no pierde nada. El cliente **nunca** envía `esExenta`. |
| Jue 22 | Paso 5: resumen con desglose (`ResumenCotizacion`) o "$0 · valor de referencia", y "Enviar solicitud" con manejo del `409 FRANJA_NO_DISPONIBLE` (conflictos y sugerencias). | Tras enviar: "Solicitud enviada". En una exenta no aparece ninguna sección de pago. |
| Vie 23 | Bandeja de aprobación: lista priorizada y detalle con calendario, adjuntos y las acciones Aprobar, Devolver, Rechazar y Reclasificar. | Devolver, rechazar y reclasificar exigen motivo antes de habilitar el botón. |
| Sáb 24 | "Mis solicitudes": lista con `InsigniaEstado` y próxima acción; detalle con `LineaTiempoSolicitud`. | Vacío: "Todavía no has hecho ninguna solicitud. Busca un espacio." Un id ajeno muestra 404. |
| Dom 25 | Corrección de bugs. | |

**Hito (sábado 24):** el recorrido del docente (exento) se hace completo en pantalla: pide el auditorio, el responsable da el aval, el jefe aprueba y queda confirmada sin pago.

### Semana 3 · Pago, actas y tablero (26 oct.–1 nov.)

| Día | Tarea | Se acepta cuando |
|---|---|---|
| Lun 26 | Cotización en el detalle de la solicitud. Simulador de tarifa (`/simulador`) con el aviso "El valor definitivo se confirma en la cotización". | Pesos como `$1.250.000`. |
| Mar 27 | Paso 6 del asistente: pago por consignación (cuenta, referencia, carga del soporte). Pantalla de tesorería: Por verificar, Aprobados, Rechazados, Vencidos; soporte junto a los datos de la orden. | En una solicitud exenta el paso 6 **no existe**. |
| Mié 28 | Actas de entrega y devolución pensadas para celular: checklist de elementos, novedades con valor. ⏬ Fotos con la cámara. | Se completa entera a 360 px. |
| Jue 29 | Tablero de indicadores y `CentroNotificaciones`. | Los números vienen de la API; nada se calcula en el cliente. |
| Vie 30 | Bitácora filtrable y configuración (usuarios y roles). Pasada de accesibilidad (teclado, contraste, `alt`, foco) y de 360 px en todas las pantallas. | Lighthouse y axe sin errores. |
| Sáb 31 | Pulido visual, estados vacíos y de error. | |
| Dom 1 | Congelamiento y ensayo de la demo. Nada nuevo después del mediodía. | |

**Orden de recorte** (`08` §5): recordatorios → PDF de cotización (se muestra en pantalla) → tablero completo (queda el conteo por estado) → fotos en el acta.

## 6. Flujo de trabajo diario

```bash
git switch feature/kevin
git fetch origin && git merge origin/develop     # cada mañana
# ... una tarea ...
git add -A && git commit -m "feat: pantalla de registro"
git push
```

1. Pull request de `feature/kevin` hacia `develop` al terminar cada tarea (máximo dos días de vida).
2. Lo aprueba Jensen (o Isabel).
3. Después de fusionar, vuelve a traer `develop` a tu rama.
4. Commits en español con Conventional Commits (`feat:`, `fix:`, `refactor:`).

## 7. Terminado

- `npm run build` y `npm run lint` pasan.
- La pantalla tiene sus cinco estados: cargando (esqueleto con la forma del contenido), vacío (mensaje + acción), con datos, error (mensaje de la API + reintentar) y sin permiso.
- Funciona desde 360 px sin scroll horizontal y se usa completa con teclado.
- Toda imagen tiene `alt`, todo campo tiene etiqueta, contraste de al menos 4,5:1.
- El PR no trae ningún archivo de `docs/` ni del repo Backend, y ningún mock.

## 8. Reglas que tu agente no rompe

- Server Components para lo público; Client Components solo para lo interactivo (calendario, asistente, formularios).
- Todo fetch por `src/lib/api.ts`. Colores solo por tokens de `globals.css`; naranja y verde nunca como color de texto sobre blanco.
- La validación que cuenta es la del servidor: nunca decides disponibilidad, exención ni precio en el cliente.
- Los botones dicen lo que hacen ("Enviar solicitud" → "Solicitud enviada"), nunca "Operación exitosa".
- Fechas `dd/mm/aaaa`, hora de 12 h con "a. m." / "p. m.", siempre en `America/Bogota`.
- Nada de pasarela de pago, Google/Microsoft, segundo factor ni mapa de calor: están fuera del avance.
- FullCalendar se queda en la versión 6 (`6.1.21`); la línea de tiempo por recursos es de pago y no se usa.
- Si dos documentos se contradicen o algo no está aquí: **para y pregunta a Jensen**.
