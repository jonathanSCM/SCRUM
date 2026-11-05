import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { membersOf } from "@/lib/workspace";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { formatIssueKey } from "@/lib/scrum/issueKey";

// Índice liviano para el autocompletado de # y @ (se pide una vez y se filtra en el navegador).
export async function GET() {
  const auth = await apiUser({ workspace: true });
  if ("error" in auth) return auth.error;
  try {
    const workspaceId = auth.user.workspaceId!;
    const [projects, issues, sprints, users] = await Promise.all([
      prisma.project.findMany({ where: { workspaceId }, select: { id: true, name: true, key: true }, orderBy: { name: "asc" } }),
      prisma.task.findMany({ where: { issueType: { not: "EPIC" }, project: { workspaceId } }, select: { id: true, number: true, title: true, project: { select: { key: true, name: true } } }, orderBy: { updatedAt: "desc" }, take: 1500 }),
      prisma.sprint.findMany({ where: { project: { workspaceId } }, select: { id: true, name: true, state: true, project: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 300 }),
      membersOf(workspaceId).then((m) => m.map(({ id, name }) => ({ id, name }))),
    ]);
    return NextResponse.json({
      projects: projects.map((p) => ({ id: p.id, label: p.name, sub: p.key ?? "" })),
      issues: issues.map((i) => ({ id: i.id, label: `${formatIssueKey(i.project.key, i.number)} ${i.title}`, sub: i.project.name })),
      sprints: sprints.map((s) => ({ id: s.id, label: s.name, sub: s.project?.name ?? "" })),
      users: users.map((u) => ({ id: u.id, label: u.name, sub: "" })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
