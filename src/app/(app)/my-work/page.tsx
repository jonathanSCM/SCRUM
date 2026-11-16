import { visibleProjectWhere } from "@/lib/scrum/groups";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/session";
import { issueInclude } from "@/lib/issues";
import { toIssueCard } from "@/lib/issueView";
import { compareByRank } from "@/lib/scrum/rank";
import MyWorkView from "./MyWorkView";

export const metadata = { title: "Mi trabajo" };

export default async function MyWorkPage() {
  const { session, workspaceId } = await requireWorkspace();
  const rows = await prisma.task.findMany({
    where: { assigneeUserId: session.user.id, issueType: { not: "EPIC" }, project: visibleProjectWhere(session.user.id, workspaceId) },
    include: { ...issueInclude, project: { select: { key: true, name: true, color: true } }, sprint: { select: { name: true, state: true } } },
  });

  const items = rows
    .map((r) => ({
      // La tarjeta lleva su proyecto (nombre y color) porque aquí se mezclan todos.
      issue: { ...toIssueCard(r, r.project.key), projectName: r.project.name, projectKey: r.project.key, projectColor: r.project.color },
      projectId: r.projectId,
      projectName: r.project.name,
      projectColor: r.project.color,
      sprint: r.sprint && r.sprint.state === "ACTIVE" ? r.sprint.name : null,
    }))
    .sort((a, b) => compareByRank(a.issue, b.issue));

  return <MyWorkView items={items} />;
}
