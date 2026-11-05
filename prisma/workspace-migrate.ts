import type { PrismaClient } from "@prisma/client";
import { migratedRole, uniqueSlug } from "../src/lib/scrum/roles";

// Multi-equipo: convierte la instalación de un solo equipo en un equipo "ProShop".
// Corre en cada arranque (ver docker-entrypoint.sh), así que TIENE que ser idempotente:
// solo toca lo que todavía no tiene equipo.

export type WorkspaceReport = Record<string, number | string>;

export async function migrateWorkspaces(prisma: PrismaClient): Promise<WorkspaceReport> {
  const report: WorkspaceReport = {};
  const users = await prisma.user.findMany({ select: { id: true, email: true, role: true, createdAt: true }, orderBy: { createdAt: "asc" } });
  if (users.length === 0) return report; // instalación vacía: el primer registro crea el equipo

  // 1) El equipo por defecto: el más antiguo; si no existe, se crea.
  let ws = await prisma.workspace.findFirst({ orderBy: { createdAt: "asc" } });
  let ownerId: string | null = null;
  if (!ws) {
    const wanted = process.env.OWNER_EMAIL?.trim().toLowerCase();
    const owner = (wanted && users.find((u) => u.email.toLowerCase() === wanted)) || users.find((u) => u.role === "LEAD") || users[0];
    ownerId = owner.id;
    const taken = (await prisma.workspace.findMany({ select: { slug: true } })).map((w) => w.slug);
    ws = await prisma.workspace.create({ data: { name: "ProShop", slug: uniqueSlug("ProShop", taken) } });
    report.workspaceCreated = ws.slug;
    report.owner = owner.email;
  }

  // 2) Toda cuenta sin ningún equipo entra al equipo por defecto (las de antes y las que se creen entre despliegues).
  const withMembership = new Set((await prisma.membership.findMany({ select: { userId: true } })).map((m) => m.userId));
  let added = 0;
  for (const u of users) {
    if (withMembership.has(u.id)) continue;
    await prisma.membership.create({
      data: { userId: u.id, workspaceId: ws.id, role: migratedRole(u.role === "LEAD" ? "LEAD" : "MEMBER", u.id === ownerId) },
    });
    added++;
  }
  if (added) report.membershipsCreated = added;

  // 3) Un equipo sin dueño no puede existir (por ejemplo si se borró el dueño): el admin más antiguo pasa a dueño.
  const owners = await prisma.membership.count({ where: { workspaceId: ws.id, role: "OWNER" } });
  if (owners === 0) {
    const candidate = (await prisma.membership.findFirst({ where: { workspaceId: ws.id, role: "ADMIN" }, orderBy: { createdAt: "asc" } })) ?? (await prisma.membership.findFirst({ where: { workspaceId: ws.id }, orderBy: { createdAt: "asc" } }));
    if (candidate) {
      await prisma.membership.update({ where: { id: candidate.id }, data: { role: "OWNER" } });
      report.ownerPromoted = 1;
    }
  }

  // 4) Todo lo que aún no tiene equipo pasa al equipo por defecto.
  const where = { workspaceId: null };
  const data = { workspaceId: ws.id };
  const moved = {
    projects: (await prisma.project.updateMany({ where, data })).count,
    statuses: (await prisma.statusOption.updateMany({ where, data })).count,
    chatMessages: (await prisma.chatMessage.updateMany({ where, data })).count,
    chatFiles: (await prisma.chatFile.updateMany({ where, data })).count,
    chatDeletions: (await prisma.chatDeletion.updateMany({ where, data })).count,
    apiTokens: (await prisma.apiToken.updateMany({ where, data })).count,
  };
  for (const [k, v] of Object.entries(moved)) if (v > 0) report[`${k}Assigned`] = v;
  return report;
}
