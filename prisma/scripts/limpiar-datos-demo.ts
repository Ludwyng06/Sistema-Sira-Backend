// Limpia los datos de las pruebas automáticas E2E de la base local para la demo (pendiente #3 de Isa):
// 1. Archiva los espacios creados por las pruebas E2E (nombre con "E2E") para que no salgan en el catálogo.
// 2. Desactiva las cuentas de prueba e2e-*@*.
// 3. Asigna una dependencia activa a las cuentas institucionales (@itp.edu.co) con perfil INTERNO sin dependencia.
// Uso: npx tsx prisma/scripts/limpiar-datos-demo.ts
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const espaciosE2E = await prisma.espacio.updateMany({
    where: {
      OR: [
        { nombre: { contains: 'E2E', mode: 'insensitive' } },
        { codigo: { startsWith: 'E2E', mode: 'insensitive' } },
      ],
      archivadoEn: null,
    },
    data: { archivadoEn: new Date(), esReservable: false, estado: 'FUERA_DE_SERVICIO' },
  });
  console.log(`Espacios E2E archivados: ${espaciosE2E.count}`);

  const usuariosE2E = await prisma.usuario.updateMany({
    where: {
      correo: { startsWith: 'e2e-', mode: 'insensitive' },
      activo: true,
    },
    data: { activo: false },
  });
  console.log(`Usuarios E2E desactivados: ${usuariosE2E.count}`);

  const dependencia = await prisma.dependencia.findFirst({
    where: { activa: true },
    orderBy: { nombre: 'asc' },
    select: { id: true, nombre: true },
  });

  if (dependencia) {
    const perfilesSinDep = await prisma.solicitante.updateMany({
      where: {
        tipo: 'INTERNO',
        dependenciaId: null,
        usuario: { correo: { endsWith: '@itp.edu.co', mode: 'insensitive' } },
      },
      data: { dependenciaId: dependencia.id },
    });
    console.log(
      `Perfiles institucionales (@itp.edu.co) vinculados a "${dependencia.nombre}": ${perfilesSinDep.count}`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
