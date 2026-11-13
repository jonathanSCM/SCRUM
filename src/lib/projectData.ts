import "server-only";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAccessTo } from "@/lib/session";
import { assignableMembers } from "@/lib/projectMembers";
import { issueInclude } from "@/lib/issues";
import { toIssueCard, toSprintData } from "@/lib/issueView";
import { parseStringList } from "@/lib/scrum/ready";
import { compareByRank } from "@/lib/scrum/rank";
import type { IssueCardData, ProjectOptions, SprintData } from "@/lib/types";

// Consultas compartidas por las pantallas de un proyecto.

// Abre un proyecto SOLO si la persona es miembro de su equipo; si no existe o es de otro equipo, 404.
// Devuelve además `access` (rol de la persona en ese equipo) para decidir qué controles mostrar.
export async function getProjectOrNotFound(id: string) {
  const access = await requireAccessTo("project", id);
  const project = await prisma.project.findUnique({
    where: { id },
    include: { status: true, lead: { select: { id: true, name: true } } },
  });
  if (!project) notFound();
  return { ...project, access };
}

export async function getProjectOptions(projectId: string, projectKey: string | null): Promise<ProjectOptions> {
  const [members, epics, sprints, proj] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } }).then((p) => (p?.workspaceId ? assignableMembers(projectId, p.workspaceId) : [])),
    prisma.task.findMany({ where: { projectId, issueType: "EPIC" }, orderBy: { number: "asc" }, select: { id: true, number: true, title: true, epicColor: true } }),
    prisma.sprint.findMany({ where: { projectId, state: { in: ["PLANNED", "ACTIVE"] } }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, state: true } }),
    prisma.project.findUnique({ where: { id: projectId }, select: { readyItems: true } }),
  ]);
  return {
    members,
    epics: epics.map((e) => ({ id: e.id, key: `${projectKey ?? "?"}-${e.number}`, title: e.title, color: e.epicColor })),
    sprints: sprints.map((s) => ({ id: s.id, name: s.name, state: s.state as ProjectOptions["sprints"][number]["state"] })),
    readyItems: parseStringList(proj?.readyItems),
  };
}

export async function getProjectSprints(projectId: string): Promise<SprintData[]> {
  const sprints = await prisma.sprint.findMany({ where: { projectId }, orderBy: [{ createdAt: "asc" }] });
  return sprints.map(toSprintData);
}

// Tickets (sin épicas) de un proyecto, ya ordenados por rank.
export async function getProjectIssues(projectId: string, projectKey: string | null, where: { sprintId?: string | null | { in: string[] } } = {}): Promise<IssueCardData[]> {
  const rows = await prisma.task.findMany({
    where: { projectId, issueType: { not: "EPIC" }, ...where },
    include: issueInclude,
  });
  return rows.map((r) => toIssueCard(r, projectKey)).sort(compareByRank);
}
