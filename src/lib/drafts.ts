import "server-only";
import { prisma } from "@/lib/prisma";
import { parseLabels } from "@/lib/scrum/labels";
import { createIssue, IssueError, type Actor } from "@/lib/issues";
import type { IssueType, Priority } from "@/lib/scrum/constants";

// Borradores privados de tickets (SCP-68): solo su dueño los ve; al compartirlos pasan a ser tickets del equipo.

export type DraftDTO = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  issueType: IssueType;
  priority: Priority;
  storyPoints: number | null;
  labels: string[];
  assigneeUserId: string | null;
  epicId: string | null;
  updatedAt: string;
};

type Row = Awaited<ReturnType<typeof prisma.draftIssue.findFirstOrThrow>>;

export const toDraftDTO = (r: Row): DraftDTO => ({
  id: r.id,
  projectId: r.projectId,
  title: r.title,
  description: r.description,
  issueType: r.issueType as IssueType,
  priority: r.priority as Priority,
  storyPoints: r.storyPoints,
  labels: parseLabels(r.labels),
  assigneeUserId: r.assigneeUserId,
  epicId: r.epicId,
  updatedAt: r.updatedAt.toISOString(),
});

// Mis borradores (de un proyecto o de todo el equipo). Siempre filtra por dueño: nadie más los ve, ni un líder.
export async function listMyDrafts(userId: string, where: { projectId?: string; workspaceId?: string }): Promise<DraftDTO[]> {
  const rows = await prisma.draftIssue.findMany({
    where: { ownerId: userId, ...(where.projectId ? { projectId: where.projectId } : {}), ...(where.workspaceId ? { project: { workspaceId: where.workspaceId } } : {}) },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(toDraftDTO);
}

// Convierte el borrador en un ticket real (con las mismas validaciones y avisos que cualquier ticket) y lo borra.
export async function shareDraft(projectId: string, draftId: string, actor: Actor, sprintId?: string | null) {
  const draft = await prisma.draftIssue.findFirst({ where: { id: draftId, projectId, ownerId: actor.id } });
  if (!draft) throw new IssueError("Borrador no encontrado", 404);
  const issue = await createIssue(
    projectId,
    {
      title: draft.title,
      description: draft.description,
      issueType: draft.issueType as IssueType,
      priority: draft.priority as Priority,
      storyPoints: draft.storyPoints,
      labels: parseLabels(draft.labels),
      assigneeUserId: draft.assigneeUserId,
      epicId: draft.issueType === "EPIC" ? null : draft.epicId,
      sprintId: sprintId ?? null,
    },
    actor
  );
  await prisma.draftIssue.deleteMany({ where: { id: draftId, ownerId: actor.id } });
  return issue;
}
