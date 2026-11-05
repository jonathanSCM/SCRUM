import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/session";
import { membersOf } from "@/lib/workspace";
import { describeHistory } from "@/lib/historyText";
import { formatIssueKey } from "@/lib/scrum/issueKey";
import { pct } from "@/lib/ui";
import HomeView from "./HomeView";

export default async function HomePage() {
  const { session, workspaceId } = await requireWorkspace();
  const inWs = { project: { workspaceId } };
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  const [projectCount, activeSprints, open, overdue, doneWeek, workload, history] = await Promise.all([
    prisma.project.count({ where: { workspaceId } }),
    prisma.sprint.findMany({
      where: { state: "ACTIVE", project: { workspaceId } },
      include: { project: { select: { id: true, name: true, key: true } }, tasks: { where: { issueType: { not: "EPIC" } }, select: { status: true, storyPoints: true } } },
      orderBy: { endDate: "asc" },
    }),
    prisma.task.count({ where: { ...inWs, issueType: { not: "EPIC" }, status: { not: "DONE" } } }),
    prisma.task.findMany({
      where: { ...inWs, issueType: { not: "EPIC" }, status: { not: "DONE" }, dueDate: { lt: now } },
      orderBy: { dueDate: "asc" },
      take: 8,
      include: { project: { select: { id: true, key: true } }, assignee: { select: { name: true } } },
    }),
    prisma.task.count({ where: { ...inWs, issueType: { not: "EPIC" }, status: "DONE", completedAt: { gte: weekAgo } } }),
    prisma.task.groupBy({ by: ["assigneeUserId"], where: { ...inWs, issueType: { not: "EPIC" }, status: { not: "DONE" }, assigneeUserId: { not: null } }, _count: { _all: true }, _sum: { storyPoints: true } }),
    prisma.historyEntry.findMany({ where: { project: { workspaceId } }, orderBy: { changedAt: "desc" }, take: 10, include: { project: { select: { id: true, key: true, name: true } } } }),
  ]);

  const overdueTotal = await prisma.task.count({ where: { ...inWs, issueType: { not: "EPIC" }, status: { not: "DONE" }, dueDate: { lt: now } } });
  const users = await membersOf(workspaceId);
  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  return (
    <HomeView
      userName={session.user.name ?? ""}
      kpis={{ projects: projectCount, activeSprints: activeSprints.length, open, overdue: overdueTotal, doneWeek }}
      sprints={activeSprints.map((s) => {
        const total = s.tasks.length;
        const done = s.tasks.filter((t) => t.status === "DONE").length;
        const totalPts = s.tasks.reduce((n, t) => n + (t.storyPoints ?? 0), 0);
        const donePts = s.tasks.filter((t) => t.status === "DONE").reduce((n, t) => n + (t.storyPoints ?? 0), 0);
        return {
          id: s.id,
          name: s.name,
          projectId: s.project!.id,
          projectName: s.project!.name,
          projectKey: s.project!.key ?? "",
          endDate: s.endDate?.toISOString() ?? null,
          done,
          total,
          percent: totalPts > 0 ? pct(donePts, totalPts) : pct(done, total),
        };
      })}
      overdue={overdue.map((t) => ({
        id: t.id,
        key: formatIssueKey(t.project.key, t.number),
        title: t.title,
        projectId: t.project.id,
        dueDate: t.dueDate!.toISOString(),
        assignee: t.assignee?.name ?? null,
      }))}
      workload={workload
        .map((w) => ({ name: nameOf.get(w.assigneeUserId!) ?? "?", count: w._count._all, points: w._sum.storyPoints ?? 0 }))
        .sort((a, b) => b.count - a.count)}
      activity={history.map((h) => ({
        id: h.id,
        who: h.changedByName ?? "Sistema",
        projectId: h.project.id,
        projectName: h.project.name,
        at: h.changedAt.toISOString(),
        ...describeHistory(h),
      }))}
    />
  );
}
