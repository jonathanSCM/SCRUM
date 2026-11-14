import "server-only";
import { prisma } from "@/lib/prisma";
import { collapseActions, kindOfField, summarizeActivity, weekBounds, type RawEvent } from "@/lib/scrum/activity";
import { membersOf } from "@/lib/workspace";
import { formatIssueKey } from "@/lib/scrum/issueKey";
import { describeHistory } from "@/lib/historyText";

// Actividad del equipo en una semana (para el dueño). Fuente: el historial de cambios (proyectos, tickets,
// sprints, notas, archivos) y los dailys. El chat NO se mira.
// Tope de filas que se leen de una semana (una semana normal tiene cientos o pocos miles).
const MAX_EVENTS = 60_000;

export async function getTeamActivity(workspaceId: string, monday: string, tz: string, focusUserId?: string) {
  const { days, from, to } = weekBounds(monday, tz);
  const members = await membersOf(workspaceId);
  const ids = members.map((m) => m.id);

  // Solo los proyectos visibles para todos (los grupos privados no cuentan). Se filtra por id, sin unir tablas.
  const projects = await prisma.project.findMany({ where: { workspaceId, isPrivate: false }, select: { id: true, name: true, key: true } });
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const [history, standups] = await Promise.all([
    // Solo lo mínimo para contar (puede haber decenas de miles de filas en una semana).
    prisma.historyEntry.findMany({
      where: { projectId: { in: [...projectById.keys()] }, changedById: { in: ids }, changedAt: { gte: from, lt: to } },
      orderBy: { changedAt: "desc" },
      take: MAX_EVENTS + 1,
      select: { changedAt: true, changedById: true, field: true, newValue: true, taskId: true, projectId: true },
    }),
    prisma.standupEntry.findMany({ where: { workspaceId, userId: { in: ids }, updatedAt: { gte: from, lt: to } }, select: { userId: true, updatedAt: true } }),
  ]);

  const truncated = history.length > MAX_EVENTS;
  if (truncated) history.length = MAX_EVENTS;
  const events: RawEvent[] = [
    ...history.map((h) => ({ userId: h.changedById!, at: h.changedAt, kind: kindOfField(h.field), projectId: h.projectId, taskId: h.taskId, field: h.field, done: h.field === "estado_ticket" && h.newValue === "Hecho" })),
    ...standups.map((s) => ({ userId: s.userId, at: s.updatedAt, kind: "DAILY" as const, projectId: null, taskId: null, field: "daily" })),
  ];
  const summary = summarizeActivity(collapseActions(events), days, tz, ids);

  // Detalle de una persona: lo último que hizo, con hora exacta (consulta aparte, solo de ella).
  let timeline: Array<{ id: string; at: Date; label: string; detail: string; project: string | null; key: string | null }> = [];
  if (focusUserId && ids.includes(focusUserId)) {
    const mine = await prisma.historyEntry.findMany({
      where: { projectId: { in: [...projectById.keys()] }, changedById: focusUserId, changedAt: { gte: from, lt: to } },
      orderBy: { changedAt: "desc" },
      take: 150,
      select: { id: true, changedAt: true, field: true, oldValue: true, newValue: true, taskId: true, taskTitle: true, projectId: true },
    });
    const taskIds = [...new Set(mine.filter((h) => h.taskId).map((h) => h.taskId!))];
    const numbers = new Map((taskIds.length ? await prisma.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, number: true } }) : []).map((t) => [t.id, t.number]));
    timeline = [
      ...mine.map((h) => {
        const d = describeHistory(h);
        const p = projectById.get(h.projectId);
        return { id: h.id, at: h.changedAt, label: d.label, detail: d.detail, project: p?.name ?? null, key: h.taskId && numbers.get(h.taskId) != null ? formatIssueKey(p?.key ?? null, numbers.get(h.taskId) ?? null) : null };
      }),
      ...standups.filter((s) => s.userId === focusUserId).map((s) => ({ id: `d-${s.updatedAt.getTime()}`, at: s.updatedAt, label: "Daily", detail: "dejó o editó su daily", project: null, key: null })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 150);
  }
  return { days, members, summary, timeline, truncated };
}
