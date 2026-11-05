import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { membersOf } from "@/lib/workspace";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { findIssueByKey } from "@/lib/issues";
import { parseChecklist } from "@/lib/scrum/checklist";
import { parseStringList } from "@/lib/scrum/ready";
import { parseLabels } from "@/lib/scrum/labels";

// Todo lo que necesita el panel lateral de un ticket en una sola llamada: el
// ticket, sus comentarios, adjuntos (sin el contenido), actividad, y las
// opciones del proyecto para los selectores (miembros, sprints, épicas).
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const auth = await apiUser({ workspace: true });
  if ("error" in auth) return auth.error;
  const { key } = await params;

  try {
    const issue = await findIssueByKey(key, auth.user.workspaceId!);
    if (!issue) return notFound("Ticket no encontrado");

    const [project, comments, attachments, history, members, sprints, epics, stories] = await Promise.all([
      prisma.project.findUnique({ where: { id: issue.projectId }, select: { id: true, key: true, name: true, readyItems: true } }),
      prisma.comment.findMany({
        where: { taskId: issue.id },
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true } } },
      }),
      prisma.attachment.findMany({
        where: { taskId: issue.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, filename: true, mimeType: true, size: true, createdAt: true, uploadedBy: { select: { id: true, name: true } } },
      }),
      prisma.historyEntry.findMany({ where: { taskId: issue.id }, orderBy: { changedAt: "desc" }, take: 40 }),
      membersOf(auth.user.workspaceId!).then((m) => m.map(({ id, name }) => ({ id, name }))),
      prisma.sprint.findMany({
        where: { projectId: issue.projectId, state: { in: ["PLANNED", "ACTIVE"] } },
        orderBy: [{ state: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, state: true },
      }),
      prisma.task.findMany({
        where: { projectId: issue.projectId, issueType: "EPIC" },
        orderBy: { number: "asc" },
        select: { id: true, number: true, title: true, epicColor: true },
      }),
      prisma.task.findMany({
        where: { projectId: issue.projectId, issueType: "STORY" },
        orderBy: { number: "asc" },
        select: { id: true, number: true, title: true },
      }),
    ]);

    const children =
      issue.issueType === "EPIC" || issue.issueType === "STORY"
        ? await prisma.task.findMany({
            where: issue.issueType === "EPIC" ? { epicId: issue.id } : { parentId: issue.id },
            orderBy: { number: "asc" },
            select: { id: true, number: true, title: true, status: true, storyPoints: true, issueType: true },
          })
        : [];

    return NextResponse.json({
      children,
      issue: { ...issue, labels: parseLabels(issue.labels), readyDone: parseStringList(issue.readyDone), checklist: parseChecklist(issue.checklist) },
      project,
      comments,
      attachments,
      history,
      options: { members, sprints, epics, stories, readyItems: parseStringList(project?.readyItems) },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
