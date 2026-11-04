import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { issueInclude } from "@/lib/issues";
import { toIssueCard } from "@/lib/issueView";
import { compareByRank } from "@/lib/scrum/rank";
import { formatIssueKey } from "@/lib/scrum/issueKey";
import { getProjectOptions, getProjectOrNotFound } from "@/lib/projectData";
import EpicsView, { type EpicRow } from "./EpicsView";

export default async function EpicsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const project = await getProjectOrNotFound(id);

  const [epics, options] = await Promise.all([
    prisma.task.findMany({ where: { projectId: id, issueType: "EPIC" }, orderBy: { number: "asc" } }),
    getProjectOptions(id, project.key),
  ]);
  const children = await prisma.task.findMany({ where: { projectId: id, epicId: { in: epics.map((e) => e.id) } }, include: issueInclude });
  const cards = children.map((c) => toIssueCard(c, project.key)).sort(compareByRank);

  const rows: EpicRow[] = epics.map((e) => {
    const items = cards.filter((c) => c.epic?.id === e.id);
    return {
      id: e.id,
      key: formatIssueKey(project.key, e.number),
      title: e.title,
      description: e.description,
      color: e.epicColor,
      status: e.status,
      issues: items,
    };
  });

  return <EpicsView projectId={id} epics={rows} options={options} currentUserId={session.user.id} />;
}
