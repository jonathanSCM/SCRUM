import "server-only";
import { prisma } from "@/lib/prisma";
import { membersOf } from "@/lib/workspace";
import { notifyUsers } from "@/lib/notifications";
import { findMentioned } from "@/lib/scrum/mentions";
import { formatIssueKey } from "@/lib/scrum/issueKey";

// Avisa (push) a quienes se mencionó con @ en un comentario y a los involucrados del ticket.
// `skipMentioned`: personas que ya habían sido mencionadas antes (al editar, no se les vuelve a avisar).
// NUNCA lanza.
export async function notifyComment(opts: { taskId: string; body: string; author: { id: string; name: string }; skipMentioned?: Set<string> }): Promise<string[]> {
  try {
    const task = await prisma.task.findUnique({
      where: { id: opts.taskId },
      select: { number: true, title: true, projectId: true, project: { select: { key: true, workspaceId: true } }, involved: { select: { userId: true } } },
    });
    if (!task?.project.workspaceId) return [];
    const people = await membersOf(task.project.workspaceId);
    const mentioned = findMentioned(opts.body, people.map(({ id, name }) => ({ id, name }))).map((p) => p.id).filter((id) => id !== opts.author.id);
    const key = formatIssueKey(task.project.key, task.number);
    const url = `/projects/${task.projectId}/board?issue=${key}`;
    const text = opts.body.replace(/\s+/g, " ").slice(0, 140);

    const fresh = mentioned.filter((id) => !opts.skipMentioned?.has(id));
    if (fresh.length) await notifyUsers(fresh, { kind: "MENTION", title: `${opts.author.name} te mencionó en ${key}`, body: text, url, groupKey: `mention-${key}`, workspaceId: task.project.workspaceId });
    // Los involucrados que no fueron mencionados reciben el aviso de comentario (solo en comentarios nuevos).
    if (!opts.skipMentioned) {
      const others = task.involved.map((i) => i.userId).filter((id) => id !== opts.author.id && !mentioned.includes(id));
      if (others.length) await notifyUsers(others, { kind: "COMMENT", title: `Comentario en ${key}`, body: `${opts.author.name}: ${text}`, url, groupKey: `comment-${key}`, workspaceId: task.project.workspaceId });
    }
    return mentioned;
  } catch (err) {
    console.error("[comentarios] no se pudo avisar:", err);
    return [];
  }
}

// Personas mencionadas en un texto (para comparar antes y después de editar).
export async function mentionedIn(taskId: string, body: string): Promise<Set<string>> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { project: { select: { workspaceId: true } } } });
  if (!task?.project.workspaceId) return new Set();
  const people = await membersOf(task.project.workspaceId);
  return new Set(findMentioned(body, people.map(({ id, name }) => ({ id, name }))).map((p) => p.id));
}
