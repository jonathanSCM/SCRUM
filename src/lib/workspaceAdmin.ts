import "server-only";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PROJECT_STATUSES } from "@/lib/scrum/constants";
import { uniqueSlug } from "@/lib/scrum/roles";

// Crea un equipo con su dueño y los estados de proyecto por defecto.
// Si hay estados sueltos de una instalación nueva (sin equipo), el primer equipo los adopta.
export async function createWorkspace(name: string, ownerUserId: string) {
  const slugs = (await prisma.workspace.findMany({ select: { slug: true } })).map((w) => w.slug);
  const workspace = await prisma.workspace.create({
    data: { name, slug: uniqueSlug(name, slugs), members: { create: { userId: ownerUserId, role: "OWNER" } } },
  });
  const orphans = await prisma.statusOption.count({ where: { workspaceId: null } });
  if (orphans > 0 && (await prisma.workspace.count()) === 1) {
    await prisma.statusOption.updateMany({ where: { workspaceId: null }, data: { workspaceId: workspace.id } });
  } else {
    for (const s of DEFAULT_PROJECT_STATUSES) await prisma.statusOption.create({ data: { ...s, workspaceId: workspace.id } });
  }
  return workspace;
}
