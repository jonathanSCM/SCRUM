import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { parseBody, readJson } from "@/lib/validation";
import { membersOf } from "@/lib/workspace";
import { notifyUsers } from "@/lib/notifications";
import { formatIssueKey } from "@/lib/scrum/issueKey";

// Involucrados de un ticket (además del responsable). A los nuevos se les avisa por push.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ issue: id });
  if ("error" in auth) return auth.error;
  const parsed = parseBody(z.object({ userIds: z.array(z.string().min(1).max(40)).max(50) }), await readJson(req));
  if ("error" in parsed) return parsed.error;
  try {
    const task = await prisma.task.findUnique({ where: { id }, select: { number: true, title: true, projectId: true, project: { select: { key: true, workspaceId: true } } } });
    if (!task?.project.workspaceId) return notFound("Ticket no encontrado");
    const people = await membersOf(task.project.workspaceId);
    const valid = new Set(people.map((p) => p.id));
    const wanted = [...new Set(parsed.data.userIds)].filter((u) => valid.has(u));
    const current = (await prisma.taskInvolved.findMany({ where: { taskId: id }, select: { userId: true } })).map((r) => r.userId);
    const added = wanted.filter((u) => !current.includes(u));
    const removed = current.filter((u) => !wanted.includes(u));
    await prisma.$transaction([
      ...(removed.length ? [prisma.taskInvolved.deleteMany({ where: { taskId: id, userId: { in: removed } } })] : []),
      ...added.map((userId) => prisma.taskInvolved.create({ data: { taskId: id, userId } })),
    ]);
    const key = formatIssueKey(task.project.key, task.number);
    const toTell = added.filter((u) => u !== auth.user.id);
    if (toTell.length) void notifyUsers(toTell, { kind: "INVOLVED_ADDED", title: `${auth.user.name} te sumó a ${key}`, body: task.title.slice(0, 120), url: `/projects/${task.projectId}/board?issue=${key}`, groupKey: `involved-${key}`, workspaceId: task.project.workspaceId });
    return NextResponse.json({ involved: people.filter((p) => wanted.includes(p.id)).map(({ id: pid, name }) => ({ id: pid, name })) });
  } catch (e) {
    return errorResponse(e);
  }
}
