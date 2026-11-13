import "server-only";
import { prisma } from "@/lib/prisma";
import { formatIssueKey } from "@/lib/scrum/issueKey";
import { previousWorkday } from "@/lib/scrum/ceremonies";
import { zonedToUtc } from "@/lib/scrum/countries";

export type DailySuggestion = { yesterday: string; today: string; blockers: string };

const cap = (lines: string[]) => lines.join("\n").slice(0, 2000);

// Borrador del daily a partir del trabajo real en tickets de esa persona (solo para ella):
//   ayer      → lo que hizo en el día laboral anterior (terminó, movió, creó, comentó)
//   hoy       → sus tickets en progreso / en revisión (si no hay, los que le tocan en el sprint activo)
//   bloqueos  → sus tickets en estado Bloqueadas
export async function dailySuggestion(userId: string, workspaceId: string, date: string, tz: string): Promise<DailySuggestion> {
  const prev = previousWorkday(date);
  const parts = (d: string) => d.split("-").map(Number) as [number, number, number];
  const from = zonedToUtc(...parts(prev), 0, 0, tz);
  const to = zonedToUtc(...parts(date), 0, 0, tz);
  const inWs = { project: { workspaceId } };
  const real = { issueType: { not: "EPIC" }, ...inWs };
  const taskSelect = { id: true, number: true, title: true, status: true, project: { select: { key: true, name: true } } } as const;

  const [history, open, blocked] = await Promise.all([
    prisma.historyEntry.findMany({
      where: { changedById: userId, ...inWs, taskId: { not: null }, changedAt: { gte: from, lt: to }, field: { in: ["estado_ticket", "ticket_creado", "comentario"] } },
      orderBy: { changedAt: "asc" },
      select: { taskId: true, field: true, newValue: true },
    }),
    prisma.task.findMany({ where: { assigneeUserId: userId, ...real, status: { in: ["IN_PROGRESS", "IN_REVIEW"] } }, orderBy: { updatedAt: "desc" }, take: 10, select: taskSelect }),
    prisma.task.findMany({ where: { assigneeUserId: userId, ...real, status: "BLOCKED" }, orderBy: { updatedAt: "desc" }, take: 10, select: taskSelect }),
  ]);

  const taskIds = [...new Set(history.map((h) => h.taskId!))];
  const tasks = taskIds.length ? await prisma.task.findMany({ where: { id: { in: taskIds }, ...real }, select: taskSelect }) : [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const label = (t: (typeof tasks)[number]) => `${formatIssueKey(t.project.key, t.number)} ${t.title}`;

  // Por ticket, lo más importante que hizo ayer: terminarlo > moverlo > crearlo > comentarlo.
  const rank: Record<string, number> = { done: 4, moved: 3, created: 2, commented: 1 };
  const did = new Map<string, "done" | "moved" | "created" | "commented">();
  for (const h of history) {
    const kind = h.field === "ticket_creado" ? "created" : h.field === "comentario" ? "commented" : h.newValue === "Hecho" ? "done" : "moved";
    const cur = did.get(h.taskId!);
    if (!cur || rank[kind] > rank[cur]) did.set(h.taskId!, kind);
  }
  const verb = { done: "Terminé", moved: "Avancé", created: "Creé", commented: "Comenté en" } as const;
  const yesterday = [...did.entries()]
    .filter(([id]) => byId.has(id))
    .sort((a, b) => rank[b[1]] - rank[a[1]])
    .slice(0, 12)
    .map(([id, kind]) => `• ${verb[kind]} ${label(byId.get(id)!)}`);

  let todayTasks = open;
  if (todayTasks.length === 0) {
    todayTasks = await prisma.task.findMany({ where: { assigneeUserId: userId, ...real, status: "TODO", sprint: { state: "ACTIVE" } }, orderBy: [{ rank: "asc" }], take: 5, select: taskSelect });
  }
  const today = todayTasks.map((t) => `• ${t.status === "TODO" ? "Empezar" : "Seguir con"} ${label(t)}`);
  const blockers = blocked.map((t) => `• ${label(t)} está bloqueado`);

  return { yesterday: cap(yesterday), today: cap(today), blockers: cap(blockers) };
}
