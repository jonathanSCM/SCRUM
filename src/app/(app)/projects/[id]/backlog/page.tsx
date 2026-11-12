import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getProjectIssues, getProjectOptions, getProjectOrNotFound, getProjectSprints } from "@/lib/projectData";
import { sprintPdfEnabled } from "@/lib/features";
import { listMyDrafts } from "@/lib/drafts";
import DraftsPanel from "@/components/issue/DraftsPanel";
import BacklogView from "./BacklogView";

export const metadata = { title: "Backlog" };

export default async function BacklogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const project = await getProjectOrNotFound(id);

  const [allSprints, options] = await Promise.all([getProjectSprints(id), getProjectOptions(id, project.key)]);
  const openSprints = allSprints.filter((s) => s.state !== "COMPLETED");
  const openIds = openSprints.map((s) => s.id);

  const [backlogIssues, sprintIssues] = await Promise.all([
    getProjectIssues(id, project.key, { sprintId: null }),
    openIds.length ? getProjectIssues(id, project.key, { sprintId: { in: openIds } }) : Promise.resolve([]),
  ]);

  const completedCount = await prisma.sprint.count({ where: { projectId: id, state: "COMPLETED" } });
  const drafts = await listMyDrafts(session.user.id, { projectId: id });

  return (
    <>
    <DraftsPanel className="mb-4" drafts={drafts} projects={[{ id, name: project.name, key: project.key }]} options={options} currentUserId={session.user.id} />
    <BacklogView
      projectId={id}
      sprints={openSprints}
      issues={[...backlogIssues, ...sprintIssues]}
      options={options}
      currentUserId={session.user.id}
      isLead={project.access.isLead}
      completedSprints={completedCount}
      pdfEnabled={sprintPdfEnabled()}
    />
    </>
  );
}
