import "server-only";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { issueInclude } from "@/lib/issues";
import { toIssueCard, toSprintData } from "@/lib/issueView";
import { compareByRank } from "@/lib/scrum/rank";
import type { IssueCardData, ProjectOptions, SprintData } from "@/lib/types";

// Consultas compartidas por las pantallas de un proyecto.

export async function getProjectOrNotFound(id: string) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: { status: true, lead: { select: { id: true, name: true } } },
  });
  if (!project) notFound();
  return project;
}

export async function getProjectOptions(projectId: string, projectKey: string | null): Promise<ProjectOptions> {
  const [members, epics, sprints] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.task.findMany({ where: { projectId, issueType: "EPIC" }, orderBy: { number: "asc" }, select: { id: true, number: true, title: true, epicColor: true } }),
    prisma.sprint.findMany({ where: { projectId, state: { in: ["PLANNED", "ACTIVE"] } }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, state: true } }),
  ]);
  return {
    members,
    epics: epics.map((e) => ({ id: e.id, key: `${projectKey ?? "?"}-${e.number}`, title: e.title, color: e.epicColor })),
    sprints: sprints.map((s) => ({ id: s.id, name: s.name, state: s.state as ProjectOptions["sprints"][number]["state"] })),
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
