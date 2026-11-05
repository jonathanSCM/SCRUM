import { PrismaClient } from "@prisma/client";
import { migrateLegacy } from "./legacy-migrate";

const prisma = new PrismaClient();

// Corre en cada arranque (ver docker-entrypoint.sh): siembra los estados de
// proyecto por defecto y convierte los datos viejos al modelo Scrum. Es
// idempotente: si ya está todo convertido no toca nada.
// Copia los mensajes del chat por proyecto (versión anterior) al chat general,
// mencionando su proyecto. Idempotente: cada uno se copia una sola vez (legacyId).
async function migrateProjectMessages(): Promise<number> {
  const old = await prisma.projectMessage.findMany({ orderBy: { createdAt: "asc" } });
  if (old.length === 0) return 0;
  const done = new Set((await prisma.chatMessage.findMany({ where: { legacyId: { not: null } }, select: { legacyId: true } })).map((m) => m.legacyId));
  let copied = 0;
  for (const m of old) {
    if (done.has(m.id)) continue;
    await prisma.chatMessage.create({
      data: {
        body: `[[project:${m.projectId}]] ${m.body}`,
        legacyId: m.id,
        createdAt: m.createdAt,
        authorId: m.authorId,
        refs: { create: [{ kind: "PROJECT", targetId: m.projectId, projectId: m.projectId }] },
      },
    });
    copied++;
  }
  return copied;
}

async function main() {
  const report = await migrateLegacy(prisma);
  const changes = Object.entries(report).map(([k, v]) => `${k}=${v}`);
  console.log(changes.length ? `Migración de datos: ${changes.join(", ")}` : "Migración de datos: nada para convertir.");

  // La versión anterior del chat hacía borrado "suave": se eliminan de verdad.
  await prisma.chatMessage.deleteMany({ where: { deletedAt: { not: null } } });

  const copied = await migrateProjectMessages();
  if (copied > 0) console.log(`Chat: ${copied} mensajes de proyectos copiados al chat general.`);

  const userCount = await prisma.user.count();
  if (userCount === 0) console.log("No hay usuarios todavía: entrá a /register para crear el primer admin.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
