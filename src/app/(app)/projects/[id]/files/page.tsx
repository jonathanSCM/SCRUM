import { prisma } from "@/lib/prisma";
import { getProjectOrNotFound } from "@/lib/projectData";
import { listResources } from "@/lib/resourceData";
import { formatIssueKey } from "@/lib/scrum/issueKey";
import FilesView from "./FilesView";

export const metadata = { title: "Archivos" };

export default async function FilesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectOrNotFound(id);
  const [resources, sprints, tasks] = await Promise.all([
    listResources(id),
    prisma.sprint.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" }, select: { id: true, name: true } }),
    prisma.task.findMany({ where: { projectId: id, issueType: { not: "EPIC" } }, orderBy: { number: "desc" }, take: 300, select: { id: true, number: true, title: true } }),
  ]);
  return (
    <FilesView
      projectId={id}
      initial={resources}
      sprints={sprints}
      tickets={tasks.map((t) => ({ id: t.id, label: `${formatIssueKey(project.key, t.number)} ${t.title}` }))}
      currentUserId={project.access.session.user.id}
      isLead={project.access.isLead}
    />
  );
}
