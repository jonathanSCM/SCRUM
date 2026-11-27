import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { workspaceOfResource } from "@/lib/workspace";
import { assignableMembers } from "@/lib/projectMembers";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { findIssueByKey } from "@/lib/issues";
import { formatIssueKey } from "@/lib/scrum/issueKey";
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
    if (!issue || !(await workspaceOfResource("issue", issue.id, auth.user.id))) return notFound("Ticket no encontrado"); // un grupo privado ajeno no existe

    const [project, comments, attachments, history, members, sprints, epics, stories, involvedRows] = await Promise.all([
      prisma.project.findUnique({ where: { id: issue.projectId }, select: { id: true, key: true, name: true, readyItems: true } }),
      prisma.comment.findMany({
        where: { taskId: issue.id },
        orderBy: { createdAt: "desc" },
        include: { author: { select: { id: true, name: true } } },
      }),
      prisma.attachment.findMany({
        where: { taskId: issue.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, filename: true, mimeType: true, size: true, createdAt: true, uploadedBy: { select: { id: true, name: true } } },
      }),
      prisma.historyEntry.findMany({ where: { taskId: issue.id }, orderBy: { changedAt: "desc" }, take: 40 }),
      assignableMembers(issue.projectId, auth.user.workspaceId!),
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
      prisma.taskInvolved.findMany({ where: { taskId: issue.id }, select: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } }),
    ]);

    const children =
      issue.issueType === "EPIC" || issue.issueType === "STORY"
        ? await prisma.task.findMany({
            where: issue.issueType === "EPIC" ? { epicId: issue.id } : { parentId: issue.id },
            orderBy: { number: "asc" },
            select: { id: true, number: true, title: true, status: true, storyPoints: true, issueType: true },
          })
        : [];

    // Subtareas que ya son tickets (con su estado) y, si este ticket nació de una subtarea, de cuál.
    const checklist = parseChecklist(issue.checklist);
    const ticketIds = [...new Set(checklist.map((c) => c.ticket).filter((x): x is string => !!x))];
    const [linkedRows, originRow] = await Promise.all([
      ticketIds.length ? prisma.task.findMany({ where: { id: { in: ticketIds }, projectId: issue.projectId }, select: { id: true, number: true, title: true, status: true } }) : Promise.resolve([]),
      issue.originId ? prisma.task.findUnique({ where: { id: issue.originId }, select: { number: true, title: true } }) : Promise.resolve(null),
    ]);
    const linkedById = new Map(linkedRows.map((t) => [t.id, t]));
    const checklistTickets = Object.fromEntries(checklist.flatMap((c) => (c.ticket && linkedById.has(c.ticket) ? [[c.id, { key: formatIssueKey(project?.key ?? null, linkedById.get(c.ticket)!.number), title: linkedById.get(c.ticket)!.title, status: linkedById.get(c.ticket)!.status }]] : [])));
    const origin = originRow ? { key: formatIssueKey(project?.key ?? null, originRow.number), title: originRow.title } : null;

    return NextResponse.json({
      checklistTickets,
      origin,
      children,
      issue: { ...issue, labels: parseLabels(issue.labels), readyDone: parseStringList(issue.readyDone), readyExtra: parseStringList(issue.readyExtra), readyOff: parseStringList(issue.readyOff), checklist: checklist.map((c) => (c.ticket && !linkedById.has(c.ticket) ? { ...c, ticket: undefined } : c)) },
      project,
      involved: involvedRows.map((r) => r.user),
      comments,
      attachments,
      history,
      options: { members, sprints, epics, stories, readyItems: parseStringList(project?.readyItems) },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
