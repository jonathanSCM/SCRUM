import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// No hay nada que sembrar por defecto: los estados llegan sincronizados
// desde el panel interno, y el primer usuario se crea vía /register.
async function main() {
  const userCount = await prisma.user.count();
  if (userCount === 0) console.log("No hay usuarios todavía: entrá a /register para crear el primer admin.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
