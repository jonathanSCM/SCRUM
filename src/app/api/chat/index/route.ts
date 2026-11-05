import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { membersOf } from "@/lib/workspace";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { formatIssueKey } from "@/lib/scrum/issueKey";

// Índice liviano para el autocompletado de # y @ (se pide una vez y se filtra en el navegador).
export async function GET(req: Request) {
  const auth = await apiUser({ workspace: true });
  if ("error" in auth) return auth.error;
  try {
    const workspaceId = auth.user.workspaceId!;

    // ?project=<id>: solo los sprints y tickets de ese proyecto (segundo nivel del autocompletado).
    const only = new URL(req.url).searchParams.get("project");
    if (only) {
      const project = await prisma.project.findFirst({ where: { id: only, workspaceId }, select: { id: true, name: true, key: true } });
      if (!project) return NextResponse.json({ sprints: [], issues: [] });
      const [issues, sprints] = await Promise.all([
        prisma.task.findMany({ where: { projectId: project.id, issueType: { not: "EPIC" } }, select: { id: true, number: true, title: true }, orderBy: { number: "desc" }, take: 1000 }),
        prisma.sprint.findMany({ where: { projectId: project.id }, select: { id: true, name: true, state: true }, orderBy: { createdAt: "desc" }, take: 100 }),
      ]);
      // Los sprints activos primero.
      const rank = (st: string) => (st === "ACTIVE" ? 0 : st === "PLANNED" ? 1 : 2);
      return NextResponse.json({
        sprints: [...sprints].sort((a, b) => rank(a.state) - rank(b.state)).map((x) => ({ id: x.id, label: x.name, sub: x.state === "ACTIVE" ? "activo" : x.state === "PLANNED" ? "planificado" : "cerrado" })),
        issues: issues.map((i) => ({ id: i.id, label: `${formatIssueKey(project.key, i.number)} ${i.title}`, sub: "" })),
      });
    }

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
