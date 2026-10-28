# aprobaciones

Aval, aprobación, devolución y reclasificación de solicitudes (UC-02).

Este módulo no tiene código propio: las decisiones comparten la máquina de estados, las franjas y la bitácora
con el resto del ciclo de la solicitud, y deben cambiar el estado en la misma transacción. Por eso viven en
`modules/reservas`:

- `POST /solicitudes/:id/decisiones` → `reservas/controllers/solicitudes.controller.ts`
- Reglas → `reservas/services/decisiones.service.ts`
- Recordatorios y escalamiento al aprobador → `reservas/jobs/recordatorios.service.ts`

La carpeta se conserva para que `03-backend.md` §1 siga mostrando el contexto del dominio.
