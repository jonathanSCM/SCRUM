import "server-only";
import { prisma } from "@/lib/prisma";
import { collapseActions, kindOfField, summarizeActivity, weekBounds, type RawEvent } from "@/lib/scrum/activity";
import { membersOf } from "@/lib/workspace";
import { formatIssueKey } from "@/lib/scrum/issueKey";
import { describeHistory } from "@/lib/historyText";

// Actividad del equipo en una semana (para el dueño). Fuente: el historial de cambios (proyectos, tickets,
// sprints, notas, archivos) y los dailys. El chat NO se mira.
export async function getTeamActivity(workspaceId: string, monday: string, tz: string, focusUserId?: string) {
  const { days, from, to } = weekBounds(monday, tz);
  const members = await membersOf(workspaceId);
  const ids = members.map((m) => m.id);

  const [history, standups] = await Promise.all([
    prisma.historyEntry.findMany({
      where: { project: { workspaceId, isPrivate: false }, changedById: { in: ids }, changedAt: { gte: from, lt: to } },
      orderBy: { changedAt: "asc" },
      select: { id: true, changedAt: true, changedById: true, field: true, oldValue: true, newValue: true, taskId: true, taskTitle: true, projectId: true, project: { select: { name: true, key: true } } },
    }),
    prisma.standupEntry.findMany({ where: { workspaceId, userId: { in: ids }, updatedAt: { gte: from, lt: to } }, select: { userId: true, updatedAt: true } }),
  ]);

  const events: RawEvent[] = [
    ...history.map((h) => ({ userId: h.changedById!, at: h.changedAt, kind: kindOfField(h.field), projectId: h.projectId, taskId: h.taskId, field: h.field, done: h.field === "estado_ticket" && h.newValue === "Hecho" })),
    ...standups.map((s) => ({ userId: s.userId, at: s.updatedAt, kind: "DAILY" as const, projectId: null, taskId: null, field: "daily" })),
  ];
  const summary = summarizeActivity(collapseActions(events), days, tz, ids);

  // Detalle de una persona: lo último que hizo, con hora exacta.
  let timeline: Array<{ id: string; at: Date; label: string; detail: string; project: string | null; key: string | null }> = [];
  if (focusUserId && ids.includes(focusUserId)) {
    const numbers = new Map((await prisma.task.findMany({ where: { id: { in: [...new Set(history.filter((h) => h.changedById === focusUserId && h.taskId).map((h) => h.taskId!))] } }, select: { id: true, number: true } })).map((t) => [t.id, t.number]));
    timeline = [
      ...history
        .filter((h) => h.changedById === focusUserId)
        .map((h) => {
          const d = describeHistory(h);
          return { id: h.id, at: h.changedAt, label: d.label, detail: d.detail, project: h.project.name, key: h.taskId && numbers.get(h.taskId) != null ? formatIssueKey(h.project.key, numbers.get(h.taskId) ?? null) : null };
        }),
      ...standups.filter((s) => s.userId === focusUserId).map((s) => ({ id: `d-${s.updatedAt.getTime()}`, at: s.updatedAt, label: "Daily", detail: "dejó o editó su daily", project: null, key: null })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 150);
  }
  return { days, members, summary, timeline };
}
