import { prisma } from "@/lib/prisma";
import { getProjectIssues, getProjectOrNotFound, getProjectSprints } from "@/lib/projectData";
import { computeBurndown } from "@/lib/scrum/burndown";
import { computeVelocity } from "@/lib/scrum/velocity";
import EmptyState from "@/components/ui/EmptyState";
import ReportsView from "./ReportsView";

export default async function ReportsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sprint?: string }> }) {
  const { id } = await params;
  const { sprint: sprintParam } = await searchParams;
  const project = await getProjectOrNotFound(id);
  const sprints = await getProjectSprints(id);

  const started = sprints.filter((s) => s.state !== "PLANNED");
  if (started.length === 0) {
    return <EmptyState title="Todavía no hay datos para reportar" hint="Los reportes aparecen cuando iniciás tu primer sprint." />;
  }

  const selected =
    started.find((s) => s.id === sprintParam) ?? started.find((s) => s.state === "ACTIVE") ?? [...started].reverse()[0];

  const issues = await getProjectIssues(id, project.key, { sprintId: { in: [selected.id] } });
  const tasks = await prisma.task.findMany({
    where: { projectId: id, sprintId: selected.id, issueType: { not: "EPIC" } },
    select: { storyPoints: true, sprintAddedAt: true, completedAt: true, status: true },
  });

  const startedAt = selected.startedAt ?? selected.startDate ?? new Date().toISOString();
  const endDate = selected.endDate ?? new Date(new Date(startedAt).getTime() + 13 * 86400000).toISOString();
  const burndown = computeBurndown({ startedAt, endDate, completedAt: selected.completedAt, tasks });
  const velocity = computeVelocity(sprints);

  return (
    <ReportsView
      projectId={id}
      sprints={started.map((s) => ({ id: s.id, name: s.name, state: s.state }))}
      selected={selected}
      burndown={burndown}
      velocity={velocity}
      done={issues.filter((i) => i.status === "DONE")}
      notDone={issues.filter((i) => i.status !== "DONE")}
    />
  );
}
