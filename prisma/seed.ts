import { PrismaClient } from "@prisma/client";
import { migrateLegacy } from "./legacy-migrate";

const prisma = new PrismaClient();

// Corre en cada arranque (ver docker-entrypoint.sh): siembra los estados de
// proyecto por defecto y convierte los datos viejos al modelo Scrum. Es
// idempotente: si ya está todo convertido no toca nada.
async function main() {
  const report = await migrateLegacy(prisma);
  const changes = Object.entries(report).map(([k, v]) => `${k}=${v}`);
  console.log(changes.length ? `Migración de datos: ${changes.join(", ")}` : "Migración de datos: nada para convertir.");

  const userCount = await prisma.user.count();
  if (userCount === 0) console.log("No hay usuarios todavía: entrá a /register para crear el primer admin.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
