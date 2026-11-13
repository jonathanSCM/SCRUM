import { PrismaClient } from "@prisma/client";
import { migrateLegacy } from "./legacy-migrate";
import { migrateWorkspaces } from "./workspace-migrate";
import { mergeDailies } from "../src/lib/scrum/dailyMerge";

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

// El daily pasó de ser por proyecto a ser general del equipo: junta las filas viejas (una por proyecto) en una por
// persona y día. No borra nada y es idempotente: si ya existe la fila general de ese día, la deja como está.
async function migrateStandups(): Promise<number> {
  const old = await prisma.standupEntry.findMany({ where: { workspaceId: null, projectId: { not: null } }, include: { project: { select: { name: true, workspaceId: true } } }, orderBy: { createdAt: "asc" } });
  const groups = new Map<string, typeof old>();
  for (const r of old) {
    const ws = r.project?.workspaceId;
    if (!ws) continue;
    const key = `${ws}|${r.userId}|${r.date}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  let created = 0;
  for (const [key, rows] of groups) {
    const [workspaceId, userId, date] = key.split("|");
    const exists = await prisma.standupEntry.findUnique({ where: { workspaceId_userId_date: { workspaceId, userId, date } }, select: { id: true } });
    if (exists) continue;
    const merged = mergeDailies(rows.map((r) => ({ projectName: r.project?.name ?? "", yesterday: r.yesterday, today: r.today, blockers: r.blockers, help: r.help })));
    await prisma.standupEntry.create({ data: { workspaceId, userId, date, ...merged, createdAt: rows[0].createdAt } });
    created++;
  }
  return created;
}

async function main() {
  const report = await migrateLegacy(prisma);
  const changes = Object.entries(report).map(([k, v]) => `${k}=${v}`);
  console.log(changes.length ? `Migración de datos: ${changes.join(", ")}` : "Migración de datos: nada para convertir.");

  // La versión anterior del chat hacía borrado "suave": se eliminan de verdad.
  await prisma.chatMessage.deleteMany({ where: { deletedAt: { not: null } } });

  const copied = await migrateProjectMessages();
  if (copied > 0) console.log(`Chat: ${copied} mensajes de proyectos copiados al chat general.`);

  const wsReport = await migrateWorkspaces(prisma);
  const wsChanges = Object.entries(wsReport).map(([k, v]) => `${k}=${v}`);
  if (wsChanges.length) console.log(`Equipos: ${wsChanges.join(", ")}`);

  const dailies = await migrateStandups();
  if (dailies > 0) console.log(`Daily: ${dailies} dailys por proyecto unidos en dailys generales del equipo.`);

  const userCount = await prisma.user.count();
  if (userCount === 0) console.log("No hay usuarios todavía: entrá a /register para crear el primer admin.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
