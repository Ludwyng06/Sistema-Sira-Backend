// Registra el reembolso de las solicitudes CANCELADAS antes de que el sistema lo creara.
// Idempotente: solo toca solicitudes con orden de pago APROBADA y sin fila en `reembolso`, y que en la
// bitácora de cancelación tengan valorReembolso > 0. Repetirlo no duplica nada.
// Uso: npx tsx prisma/scripts/registrar-reembolsos-faltantes.ts
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { motivoReembolso } from '../../src/modules/reservas/dominio/reembolso.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

interface DatosCancelacion {
  institucional?: boolean;
  diasDeAntelacion?: number;
  porcentajeReembolso?: number;
  valorReembolso?: number;
}

async function main() {
  const solicitudes = await prisma.solicitud.findMany({
    where: { estado: 'CANCELADA' },
    select: {
      id: true,
      consecutivo: true,
      cotizaciones: {
        select: {
          ordenesPago: { where: { estado: 'APROBADA' }, select: { id: true, reembolsos: { select: { id: true } } } },
        },
      },
    },
  });

  let creados = 0;
  for (const solicitud of solicitudes) {
    const ordenes = solicitud.cotizaciones.flatMap((c) => c.ordenesPago);
    if (ordenes.length === 0 || ordenes.some((o) => o.reembolsos.length > 0)) continue;

    const bitacora = await prisma.bitacora.findFirst({
      where: { accion: 'SOLICITUD_CANCELADA', entidad: 'Solicitud', entidadId: solicitud.id },
      orderBy: { ocurrioEn: 'desc' },
      select: { datosDespues: true },
    });
    const datos = (bitacora?.datosDespues ?? {}) as DatosCancelacion;
    if (typeof datos.valorReembolso !== 'number' || datos.valorReembolso <= 0) continue;

    await prisma.reembolso.create({
      data: {
        ordenPagoId: ordenes[0]!.id,
        valor: datos.valorReembolso,
        motivo: motivoReembolso(
          datos.institucional === true,
          datos.porcentajeReembolso ?? 0,
          typeof datos.diasDeAntelacion === 'number' ? datos.diasDeAntelacion : null,
        ),
        estado: 'SOLICITADO',
      },
    });
    creados += 1;
    console.log(`Reembolso registrado: ${solicitud.consecutivo ?? solicitud.id} por ${datos.valorReembolso} pesos.`);
  }
  console.log(`Listo: ${creados} reembolso(s) registrado(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
