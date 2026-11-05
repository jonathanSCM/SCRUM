import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { formatIssueKey } from "@/lib/scrum/issueKey";
import { parseStringList } from "@/lib/scrum/ready";

// Todo lo que hay que saber de un proyecto para trabajar sobre él: sprints, épicas,
// historias y tickets con su estado, responsable y jerarquía; DoR y estados disponibles.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ project: (await params).id });
  if ("error" in auth) return auth.error;
  const { id } = await params;
  try {
    const project = await prisma.project.findUnique({ where: { id }, include: { status: true, lead: { select: { name: true } } } });
    if (!project) return notFound("Proyecto no encontrado");
    const [sprints, issues, statuses] = await Promise.all([
      prisma.sprint.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, goal: true, state: true, startDate: true, endDate: true } }),
      prisma.task.findMany({
        where: { projectId: id },
        orderBy: { number: "asc" },
        include: { assignee: { select: { name: true } }, sprint: { select: { name: true } }, epic: { select: { number: true } }, parent: { select: { number: true } } },
      }),
      prisma.statusOption.findMany({ where: { workspaceId: project.workspaceId }, orderBy: { order: "asc" }, select: { id: true, name: true } }),
    ]);
    const key = (n: number | null) => formatIssueKey(project.key, n);
    return NextResponse.json({
      id: project.id,
      key: project.key,
      name: project.name,
      description: project.description,
      deployUrl: project.deployUrl,
      stack: parseStringList(project.stack),
      status: project.status.name,
      lead: project.lead?.name ?? null,
      readyItems: parseStringList(project.readyItems),
      availableStatuses: statuses,
      sprints,
      issues: issues.map((i) => ({
        id: i.id,
        key: key(i.number),
        type: i.issueType,
        title: i.title,
        description: i.description.slice(0, 600),
        status: i.status,
        priority: i.priority,
        storyPoints: i.storyPoints,
        assignee: i.assignee?.name ?? null,
        sprint: i.sprint?.name ?? null,
        epic: i.epic ? key(i.epic.number) : null,
        parent: i.parent ? key(i.parent.number) : null,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
