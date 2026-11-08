import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { membersOf } from "@/lib/workspace";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { parseBody, readJson } from "@/lib/validation";
import { updateIssue, IssueError, type IssuePatch } from "@/lib/issues";
import { parseIssueKey } from "@/lib/scrum/issueKey";
import { changesSchema, matchMember } from "@/lib/scrum/aiImport";
import { notifyComment } from "@/lib/commentNotify";

export const maxDuration = 120;

// Aplica una lista de cambios a tickets EXISTENTES de un proyecto (estado, prioridad, responsable, puntos, sprint…),
// identificados por su clave. Cada cambio es independiente: la respuesta dice cuáles se aplicaron y cuáles no.
// Todo queda a nombre de la persona (o del dueño del token). No crea ni borra tickets.
export async function POST(req: Request) {
  const auth = await apiUser({ workspace: true });
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const parsed = parseBody(changesSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;

  try {
    const workspaceId = user.workspaceId!;
    const project = await prisma.project.findFirst({ where: { id: parsed.data.project.id, workspaceId }, select: { id: true, key: true } });
    if (!project?.key) return NextResponse.json({ error: "Ese project.id no existe" }, { status: 404 });

    const [members, sprints] = await Promise.all([membersOf(workspaceId), prisma.sprint.findMany({ where: { projectId: project.id }, select: { id: true, name: true } })]);
    const sprintByName = (name: string) => sprints.find((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase());

    const applied: Array<{ key: string; fields: string[] }> = [];
    const failed: Array<{ key: string; error: string }> = [];

    for (const c of parsed.data.changes) {
      const ref = parseIssueKey(c.key);
      if (!ref || ref.projectKey !== project.key) {
        failed.push({ key: c.key, error: `La clave no es de este proyecto (${project.key}-N)` });
        continue;
      }
      const task = await prisma.task.findUnique({ where: { projectId_number: { projectId: project.id, number: ref.number } }, select: { id: true } });
      if (!task) {
        failed.push({ key: c.key, error: "No existe ese ticket" });
        continue;
      }
      try {
        const patch: IssuePatch = {};
        const fields: string[] = [];
        if (c.title !== undefined) { patch.title = c.title; fields.push("título"); }
        if (c.description !== undefined) { patch.description = c.description; fields.push("descripción"); }
        if (c.status !== undefined) { patch.status = c.status; fields.push("estado"); }
        if (c.priority !== undefined) { patch.priority = c.priority; fields.push("prioridad"); }
        if (c.storyPoints !== undefined) { patch.storyPoints = c.storyPoints; fields.push("puntos"); }
        if (c.labels !== undefined) { patch.labels = c.labels; fields.push("etiquetas"); }
        if (c.dueDate !== undefined) { patch.dueDate = c.dueDate; fields.push("fecha límite"); }
        if (c.assignee !== undefined) {
          if (c.assignee === null) patch.assigneeUserId = null;
          else {
            const m = matchMember(members, c.assignee);
            if (!m) throw new IssueError(`No encontré a "${c.assignee}" en el equipo`);
            patch.assigneeUserId = m.id;
          }
          fields.push("responsable");
        }
        if (c.sprint !== undefined) {
          if (c.sprint === null) patch.sprintId = null;
          else {
            const s = sprintByName(c.sprint);
            if (!s) throw new IssueError(`No existe el sprint "${c.sprint}" en este proyecto`);
            patch.sprintId = s.id;
          }
          fields.push("sprint");
        }
        if (Object.keys(patch).length) await updateIssue(task.id, patch, user);
        if (c.comment) {
          await prisma.comment.create({ data: { taskId: task.id, authorId: user.id, body: c.comment } });
          await notifyComment({ taskId: task.id, body: c.comment, author: { id: user.id, name: user.name } });
          fields.push("comentario");
        }
        if (fields.length === 0) throw new IssueError("No trae ningún cambio");
        applied.push({ key: c.key, fields });
      } catch (e) {
        failed.push({ key: c.key, error: e instanceof IssueError ? e.message : "Error inesperado" });
      }
    }
    return NextResponse.json({ applied, failed });
  } catch (e) {
    return errorResponse(e);
  }
}
