import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { formatIssueKey } from "@/lib/scrum/issueKey";

// Índice liviano para el autocompletado de # y @ (se pide una vez y se filtra en el navegador).
export async function GET() {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  try {
    const [projects, issues, sprints, users] = await Promise.all([
      prisma.project.findMany({ select: { id: true, name: true, key: true }, orderBy: { name: "asc" } }),
      prisma.task.findMany({ where: { issueType: { not: "EPIC" } }, select: { id: true, number: true, title: true, project: { select: { key: true, name: true } } }, orderBy: { updatedAt: "desc" }, take: 1500 }),
      prisma.sprint.findMany({ where: { projectId: { not: null } }, select: { id: true, name: true, state: true, project: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 300 }),
      prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
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
