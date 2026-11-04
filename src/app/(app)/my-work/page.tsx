import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { issueInclude } from "@/lib/issues";
import { toIssueCard } from "@/lib/issueView";
import { compareByRank } from "@/lib/scrum/rank";
import MyWorkView from "./MyWorkView";

export default async function MyWorkPage() {
  const session = await requireSession();
  const rows = await prisma.task.findMany({
    where: { assigneeUserId: session.user.id, issueType: { not: "EPIC" } },
    include: { ...issueInclude, project: { select: { key: true, name: true } }, sprint: { select: { name: true, state: true } } },
  });

  const items = rows
    .map((r) => ({
      issue: toIssueCard(r, r.project.key),
      projectId: r.projectId,
      projectName: r.project.name,
      sprint: r.sprint && r.sprint.state === "ACTIVE" ? r.sprint.name : null,
    }))
    .sort((a, b) => compareByRank(a.issue, b.issue));

  return <MyWorkView items={items} />;
}
