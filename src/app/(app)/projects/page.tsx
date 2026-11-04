import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import ProjectsView, { type ProjectCardData } from "./ProjectsView";

export default async function ProjectsPage() {
  await requireSession();
  const [projects, statuses, taskCounts] = await Promise.all([
    prisma.project.findMany({
      orderBy: { name: "asc" },
      include: { lead: { select: { name: true } }, sprints: { where: { state: "ACTIVE" }, select: { name: true, endDate: true }, take: 1 } },
    }),
    prisma.statusOption.findMany({ orderBy: { order: "asc" } }),
    prisma.task.groupBy({ by: ["projectId", "status"], where: { issueType: { not: "EPIC" } }, _count: { _all: true } }),
  ]);

  const counts = new Map<string, { done: number; total: number }>();
  for (const row of taskCounts) {
    const c = counts.get(row.projectId) ?? { done: 0, total: 0 };
    c.total += row._count._all;
    if (row.status === "DONE") c.done += row._count._all;
    counts.set(row.projectId, c);
  }

  const cards: ProjectCardData[] = projects.map((p) => ({
    id: p.id,
    key: p.key ?? "",
    name: p.name,
    statusId: p.statusId,
    lead: p.lead?.name ?? null,
    activeSprint: p.sprints[0] ? { name: p.sprints[0].name, endDate: p.sprints[0].endDate?.toISOString() ?? null } : null,
    done: counts.get(p.id)?.done ?? 0,
    total: counts.get(p.id)?.total ?? 0,
  }));

  return <ProjectsView projects={cards} statuses={statuses.map((s) => ({ id: s.id, name: s.name, color: s.color }))} />;
}
