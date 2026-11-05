import "server-only";
import { prisma } from "@/lib/prisma";
import { formatIssueKey } from "@/lib/scrum/issueKey";
import { mergeProjectActivity, weekWindow } from "@/lib/scrum/weekly";

// Datos del perfil público: quién es y qué hizo esta semana. Solo trabajo en tickets,
// notas y dailys: NO se cuenta el chat ni cuánto escribe cada persona.

const count = (rows: Array<{ projectId: string; _count: { _all: number } }>) => new Map(rows.map((r) => [r.projectId, r._count._all]));

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, tagline: true, chatColor: true, createdAt: true, images: { select: { kind: true } } },
  });
  if (!user) return null;

  const { since, prevSince, sinceDay, prevSinceDay } = weekWindow();
  const real = { issueType: { not: "EPIC" } };
  const mine = { assigneeUserId: userId, ...real };

  const [done, doneBefore, created, createdBefore, comments, commentsBefore, notesWeek, notesBefore, dailys, dailysBefore, inProgress, openByProject, doneByProject, createdByProject, notesByProject] = await Promise.all([
    prisma.task.findMany({
      where: { ...mine, status: "DONE", completedAt: { gte: since } },
      orderBy: { completedAt: "desc" },
      take: 30,
      select: { number: true, title: true, storyPoints: true, completedAt: true, projectId: true, project: { select: { key: true, name: true } } },
    }),
    prisma.task.count({ where: { ...mine, status: "DONE", completedAt: { gte: prevSince, lt: since } } }),
    prisma.task.count({ where: { reporterId: userId, ...real, createdAt: { gte: since } } }),
    prisma.task.count({ where: { reporterId: userId, ...real, createdAt: { gte: prevSince, lt: since } } }),
    prisma.comment.count({ where: { authorId: userId, createdAt: { gte: since } } }),
    prisma.comment.count({ where: { authorId: userId, createdAt: { gte: prevSince, lt: since } } }),
    prisma.note.count({ where: { authorId: userId, createdAt: { gte: since } } }),
    prisma.note.count({ where: { authorId: userId, createdAt: { gte: prevSince, lt: since } } }),
    prisma.standupEntry.count({ where: { userId, date: { gte: sinceDay } } }),
    prisma.standupEntry.count({ where: { userId, date: { gte: prevSinceDay, lt: sinceDay } } }),
    prisma.task.findMany({
      where: { ...mine, status: { in: ["IN_PROGRESS", "IN_REVIEW"] } },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: { number: true, title: true, status: true, projectId: true, project: { select: { key: true } } },
    }),
    prisma.task.groupBy({ by: ["projectId"], where: { ...mine, status: { not: "DONE" } }, _count: { _all: true } }),
    prisma.task.groupBy({ by: ["projectId"], where: { ...mine, status: "DONE", completedAt: { gte: since } }, _count: { _all: true } }),
    prisma.task.groupBy({ by: ["projectId"], where: { reporterId: userId, ...real, createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.note.groupBy({ by: ["projectId"], where: { authorId: userId, createdAt: { gte: since } }, _count: { _all: true } }),
  ]);

  const activity = mergeProjectActivity([count(openByProject), count(doneByProject), count(createdByProject), count(notesByProject)], ["open", "completed", "created", "notes"]);
  const projects = activity.length
    ? await prisma.project.findMany({
        where: { id: { in: activity.map((a) => a.projectId) } },
        select: { id: true, key: true, name: true, status: { select: { name: true } }, sprints: { where: { state: "ACTIVE" }, select: { name: true }, take: 1 } },
      })
    : [];
  const projectById = new Map(projects.map((p) => [p.id, p]));

  return {
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      tagline: user.tagline,
      color: user.chatColor,
      memberSince: user.createdAt.toISOString(),
      hasAvatar: user.images.some((i) => i.kind === "AVATAR"),
      hasBanner: user.images.some((i) => i.kind === "BANNER"),
    },
    week: {
      completed: { value: done.length, previous: doneBefore },
      points: done.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0),
      created: { value: created, previous: createdBefore },
      comments: { value: comments, previous: commentsBefore },
      notes: { value: notesWeek, previous: notesBefore },
      dailys: { value: dailys, previous: dailysBefore },
    },
    doneList: done.map((t) => ({ key: formatIssueKey(t.project.key, t.number), title: t.title, projectId: t.projectId, projectName: t.project.name, points: t.storyPoints, at: t.completedAt?.toISOString() ?? null })),
    inProgress: inProgress.map((t) => ({ key: formatIssueKey(t.project.key, t.number), title: t.title, status: t.status, projectId: t.projectId })),
    projects: activity
      .map((a) => {
        const p = projectById.get(a.projectId);
        return p ? { id: p.id, key: p.key, name: p.name, status: p.status.name, sprint: p.sprints[0]?.name ?? null, open: a.open, completed: a.completed, created: a.created, notes: a.notes } : null;
      })
      .filter((p): p is NonNullable<typeof p> => !!p),
  };
}

export async function getPeople(options: { withEmail?: boolean } = {}) {
  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true, tagline: true, chatColor: true, ...(options.withEmail ? { email: true } : {}) },
  });
  const since = weekWindow().since;
  const [open, done] = await Promise.all([
    prisma.task.groupBy({ by: ["assigneeUserId"], where: { assigneeUserId: { not: null }, issueType: { not: "EPIC" }, status: { not: "DONE" } }, _count: { _all: true } }),
    prisma.task.groupBy({ by: ["assigneeUserId"], where: { assigneeUserId: { not: null }, issueType: { not: "EPIC" }, status: "DONE", completedAt: { gte: since } }, _count: { _all: true } }),
  ]);
  const o = new Map(open.map((r) => [r.assigneeUserId, r._count._all]));
  const d = new Map(done.map((r) => [r.assigneeUserId, r._count._all]));
  return users.map((u) => ({ ...u, email: "email" in u ? (u.email as string) : null, open: o.get(u.id) ?? 0, doneWeek: d.get(u.id) ?? 0 }));
}
