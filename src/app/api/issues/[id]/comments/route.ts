import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { commentSchema, parseBody, readJson } from "@/lib/validation";
import { logHistory } from "@/lib/history";
import { DISCORD_COLOR } from "@/lib/discord";
import { notifyProject } from "@/lib/notify";
import { formatIssueKey } from "@/lib/scrum/issueKey";
import { getBaseUrl } from "@/lib/baseUrl";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  const parsed = parseBody(commentSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;

  try {
    const issue = await prisma.task.findUnique({
      where: { id },
      select: { id: true, number: true, title: true, projectId: true, assigneeUserId: true, reporterId: true, project: { select: { key: true, name: true } } },
    });
    if (!issue) return notFound("Ticket no encontrado");

    const comment = await prisma.comment.create({
      data: { taskId: id, authorId: user.id, body: parsed.data.body },
      include: { author: { select: { id: true, name: true } } },
    });
    await logHistory({ projectId: issue.projectId, taskId: id, taskTitle: issue.title, field: "comentario", newValue: parsed.data.body.slice(0, 120), actor: user });

    const key = formatIssueKey(issue.project.key, issue.number);
    await notifyProject(issue.projectId, {
      title: `Comentario en ${key}`,
      description: `**${user.name}** comentó en «${issue.title}»: ${parsed.data.body}`,
      color: DISCORD_COLOR.comment,
      excludeUserId: user.id,
      mentionUserIds: [issue.assigneeUserId !== user.id ? issue.assigneeUserId : null, issue.reporterId !== user.id ? issue.reporterId : null],
      url: `${getBaseUrl()}/projects/${issue.projectId}/board?issue=${key}`,
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
