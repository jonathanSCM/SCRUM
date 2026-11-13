import "server-only";
import { prisma } from "@/lib/prisma";

export const groupSelect = { id: true, name: true, key: true, isPrivate: true, ownerId: true, archivedAt: true, convertedToId: true, createdAt: true, updatedAt: true } as const;

// ¿Puede esta persona administrar el grupo (renombrar, dar acceso, archivar, borrar, convertir)?
// Quien lo creó y los líderes del equipo.
export const canManageGroup = (user: { id: string; role: "LEAD" | "MEMBER" }, group: { ownerId: string | null }) => user.role === "LEAD" || group.ownerId === user.id;

export type GroupSummary = {
  id: string;
  name: string;
  key: string | null;
  isPrivate: boolean;
  ownerName: string | null;
  archived: boolean;
  convertedTo: { id: string; name: string } | null;
  counts: Record<string, number>;
  total: number;
  people: Array<{ id: string; name: string }>;
  updatedAt: string;
};

// Grupos del equipo que esta persona puede ver (los privados ajenos no existen para ella).
export async function listGroups(userId: string, workspaceId: string, opts: { archived?: boolean } = {}): Promise<GroupSummary[]> {
  const rows = await prisma.project.findMany({
    where: { workspaceId, kind: "GROUP", archivedAt: opts.archived ? { not: null } : null, OR: [{ isPrivate: false }, { ownerId: userId }, { members: { some: { userId } } }] },
    orderBy: { updatedAt: "desc" },
    select: { ...groupSelect, members: { select: { user: { select: { id: true, name: true } } } } },
  });
  const ids = rows.map((r) => r.id);
  const [counts, owners, converted] = await Promise.all([
    ids.length ? prisma.task.groupBy({ by: ["projectId", "status"], where: { projectId: { in: ids }, issueType: { not: "EPIC" } }, _count: { _all: true } }) : [],
    prisma.user.findMany({ where: { id: { in: rows.map((r) => r.ownerId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
    prisma.project.findMany({ where: { id: { in: rows.map((r) => r.convertedToId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
  ]);
  const ownerName = new Map(owners.map((o) => [o.id, o.name]));
  const projectName = new Map(converted.map((p) => [p.id, p]));
  return rows.map((r) => {
    const c: Record<string, number> = {};
    let total = 0;
    for (const x of counts) if (x.projectId === r.id) { c[x.status] = x._count._all; total += x._count._all; }
    return {
      id: r.id,
      name: r.name,
      key: r.key,
      isPrivate: r.isPrivate,
      ownerName: r.ownerId ? ownerName.get(r.ownerId) ?? null : null,
      archived: !!r.archivedAt,
      convertedTo: r.convertedToId ? projectName.get(r.convertedToId) ?? null : null,
      counts: c,
      total,
      people: r.members.map((m) => m.user),
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}

