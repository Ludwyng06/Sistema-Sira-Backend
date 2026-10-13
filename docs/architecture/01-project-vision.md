# SIRA - Project Vision

> Sistema de Inventario y Reserva de Activos · Institución Universitaria del Putumayo (Uniputumayo)
> Base: *Documento base de requisitos v1.0* (Jhon Alexander Gómez Ruiz, 4 sep. 2026).
> Equipo: Jensen Ordóñez, Isabel Cerón, Kevin Guerrero.
> Los supuestos que el equipo todavía no ha confirmado van marcados con ⚠️.

## ¿Qué es SIRA?

SIRA es la plataforma web con la que la Institución Universitaria del Putumayo administra sus espacios físicos (aulas, laboratorios, salas de informática, auditorios, canchas) y los presta o alquila de forma ordenada. Reúne en un solo lugar el inventario de lo que la universidad tiene, el calendario de cuándo está libre cada espacio y el trámite completo de una reserva: solicitud, aprobación, pago cuando corresponde, entrega y devolución.

La usan dos públicos con reglas distintas. La comunidad universitaria (docentes, administrativos y estudiantes con correo institucional) pide espacios para actividades propias de la institución y no paga. Los externos (personas, empresas y entidades como la Alcaldía o la Gobernación) alquilan espacios y servicios complementarios con tarifa, cotización y soporte de pago.

Lo que la distingue de soluciones como la de otras universidades, que muestran todos los espacios en una sola lista larga, es que SIRA organiza la búsqueda como está organizado el campus: **sede → bloque (A, B, C) → espacio**, con la numeración real de los planos, la capacidad de cada espacio a la vista y la dotación con la que cuenta. Quien pide un espacio sabe desde el primer clic dónde queda, cuántas personas caben y qué incluye.

---

## ¿Qué problema resuelve?

Hoy todas las solicitudes de espacios llegan por correo a la Vicerrectoría, donde una persona las pasa a mano a un Excel para llevar el control. Cuando el solicitante es externo, se le envía por correo el número de cuenta para que consigne, otra persona organiza el espacio (sillas, montaje) y luego se entrega. Ese proceso tiene limitaciones concretas:

- **No existe un inventario único.** No se sabe con certeza qué espacios hay en cada bloque, con qué elementos cuentan ni cuánto valen.
- **No se sabe qué está libre.** Para responder si el auditorio está disponible un sábado hay que revisar el Excel y los correos. Las dobles reservas dependen de la memoria de una persona.
- **La gente pide el espacio equivocado.** Los solicitantes no saben cuántas personas caben en cada lugar y piden un auditorio de más de 80 personas para un grupo de 30, mientras un salón de 40 queda libre.
- **La tarifa se consulta caso por caso** y el recaudo depende de consignaciones sueltas, verificadas a mano contra el extracto.
- **No queda rastro.** No hay actas de entrega y devolución, ni historial de quién aprobó qué, ni cifras de ocupación o de recaudo para el informe de gestión.
- **El uso interno no se mide.** Las actividades institucionales no se cobran, pero tampoco se registra cuánto le cuesta a la universidad prestar esos espacios.

SIRA reemplaza el correo y el Excel por un flujo único: el solicitante ve la disponibilidad real en el calendario, elige un espacio adecuado a su aforo y envía la solicitud. Esta llega a quien la debe aprobar y, si es externa, termina en un pago verificable. El sistema deja trazabilidad de cada paso y cifras de ocupación, recaudo y uso interno.

---

## ¿Quiénes son los usuarios?

### Visitante

Cualquier persona que entra al portal sin cuenta. Consulta espacios y disponibilidad.

Sus principales actividades son:

- Recorrer los espacios por sede y bloque, con fotos, capacidad y dotación.
- Consultar el calendario público (solo ve "Ocupado", nunca datos de terceros).
- Usar el simulador de tarifa.

### Solicitante externo (persona natural, empresa, entidad)

Quien alquila un espacio para un evento propio: un grado, una capacitación, un torneo, una feria. Las entidades públicas pueden pagar contra orden de servicio.

Sus principales responsabilidades son:

- Registrarse con el tipo de solicitante que le corresponde y aceptar la política de datos.
- Armar la solicitud: espacios, horarios, servicios complementarios y datos del evento.
- Adjuntar los documentos exigidos (RUT, cámara de comercio, póliza cuando aplique).
- Pagar (consignación con soporte en el MVP; pasarela en línea después) y recibir el espacio.

### Usuario interno

Docente, administrativo o estudiante con correo `@itp.edu.co` o `@uniputumayo.edu.co` verificado, que pide un espacio para una actividad institucional.

Sus principales responsabilidades son:

- Verificar su correo institucional con un código.
- Declarar si el uso es institucional o particular (si es particular, paga como persona natural).
- Asociar la solicitud a una dependencia o programa y obtener su aval.

### Responsable de espacio

Encargado del auditorio, del laboratorio o del escenario deportivo.

Sus principales responsabilidades son:

- Dar el aval técnico a las solicitudes de sus espacios.
- Registrar bloqueos de mantenimiento.
- Hacer la entrega y la devolución con acta y registro fotográfico.

### Aprobador

Jefe de la dependencia dueña del espacio. ⚠️ Hoy toda solicitud la recibe la Vicerrectoría; queda por confirmar si la Vicerrectoría es aprobadora de todo o solo de los externos.

Sus principales responsabilidades son:

- Aprobar, rechazar (con motivo) o devolver solicitudes desde su bandeja.
- Reclasificar como externa una solicitud "institucional" que no lo es.

### Tesorería

Sus principales responsabilidades son:

- Verificar los soportes de consignación y confirmar los pagos.
- Conciliar el recaudo y emitir la factura electrónica.

### Administrador

Sus principales responsabilidades son:

- Parametrizar sedes, bloques, espacios, elementos, servicios, tarifas, dominios institucionales y plantillas.
- Gestionar usuarios y roles.

### Auditor (control interno)

Solo lectura sobre todo el sistema, incluida la bitácora.

---

## Funcionalidades principales

### Identidad y acceso

- Registro por tipo de solicitante, verificación de correo por código y recuperación de contraseña.
- Detección automática de los dominios institucionales.
- Roles con permisos por recurso: cada usuario ve solo lo que le corresponde.

### Inventario por bloques

- Jerarquía sede → bloque → espacio → elemento, con la numeración de los planos.
- Ficha de cada espacio: fotos, capacidad, área, dotación, condiciones de uso y tarifas.
- Elementos con placa, estado físico, valor y fotos.

### Calendario y disponibilidad

- Calendario por espacio en vistas de mes, semana y día, con estados distinguibles (libre, retenido, reservado, clase, mantenimiento, festivo).
- Bloqueos manuales y recurrentes, e importación del horario académico.
- Búsqueda inversa: "necesito un espacio para 60 personas el viernes de 2 a 6".
- Sugerencia de espacios de capacidad adecuada cuando el aforo pedido no corresponde.

### Solicitudes y aprobación

- Solicitud con varios espacios, varias franjas y servicios complementarios, con total en tiempo real.
- Retención provisional del horario y liberación automática al vencer.
- Aval del responsable y aprobación del jefe de dependencia, con recordatorios y escalamiento.
- Flujo exento para uso interno, sin pasarela y con valor de referencia.

### Cotización, pagos y recaudo

- Cotización en PDF con consecutivo y vigencia.
- Pago por consignación con carga de soporte y verificación de tesorería (MVP).
- Pasarela de pago detrás de un puerto intercambiable (fase posterior).

### Operación del espacio

- Actas de entrega y devolución con lista de chequeo, fotos y novedades.
- Depósito de garantía y cobro de daños.

### Notificaciones, reportes y auditoría

- Correo en cada cambio de estado y recordatorios antes del evento.
- Tablero de ocupación, recaudo y uso interno; exportación a XLSX, CSV y PDF.
- Bitácora inmutable de operaciones sensibles.

---

## Objetivos del sistema

- Que la Vicerrectoría deje de recibir solicitudes por correo y de mantener un Excel a mano.
- Que ningún espacio se reserve dos veces para la misma franja.
- Que el solicitante elija un espacio adecuado a su aforo sin preguntarle a nadie.
- Que cada peso recaudado tenga orden de pago, soporte y conciliación.
- Que la institución pueda reportar cuánto vale el uso interno que presta sin cobro.

---

## Alcance

**Avance de 20 días (entrega del 1 de noviembre de 2026):** el sistema completo funcionando de punta a punta sin pasarela de pago:

- Autenticación, verificación de correo, dominios institucionales y los seis roles.
- Inventario por sede y bloque con fotos, elementos y capacidad visible.
- Calendario con disponibilidad real, bloqueos y retenciones.
- Solicitud con espacios y servicios, cotización, aval y aprobación.
- Flujo exento para uso interno.
- Pago de externos por consignación con soporte verificado por tesorería.
- Actas de entrega y devolución básicas.
- Panel administrativo con tablero y bitácora.

**Después del avance, dentro de la versión 1:** pasarela de pago (Wompi o la plataforma de pagos que ya tiene la universidad en `pagos.uniputumayo.edu.co` ⚠️), factura electrónica, reembolsos, notificaciones por WhatsApp, importación masiva de inventario, inicio de sesión con Google o Microsoft, firma táctil en actas y reportes avanzados.

**Fuera de la versión 1**, como dice el documento base: contabilidad y presupuesto, nómina del personal de apoyo, construcción del horario académico y venta de boletería. Funcionalidades como el mapa de calor de ocupación, la depreciación de elementos y los paquetes preconfigurados podrán incorporarse en versiones futuras.

---

## Principios de diseño

- **El documento base del director manda.** Todo cambio respecto a él queda registrado y justificado en `07-cambios-documento-base.md`, para que el director lo apruebe.
- **Las reglas viven en la base de datos cuando pueden.** El no solapamiento de reservas se garantiza con una restricción de exclusión de PostgreSQL, no solo con validación en código.
- **Las reglas de negocio viven en servicios de dominio**, no en controladores ni en componentes de React.
- **Nada de dinero en punto flotante.** Montos en pesos enteros; la conversión a centavos ocurre solo en el adaptador de la pasarela.
- **Fechas en UTC en la base de datos y en `America/Bogota` en pantalla.**
- **Accesibilidad AA desde el primer componente**, no como auditoría final.
- **Documentación versionada junto al código**, en `docs/architecture/`, con diagramas en Mermaid.
- **Idioma:** dominio en español (entidades, campos, rutas), términos técnicos en inglés (`controller`, `service`, `dto`). Commits en español con prefijos de Conventional Commits (`feat:`, `fix:`, `docs:`).
