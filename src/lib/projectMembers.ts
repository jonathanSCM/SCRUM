import "server-only";
import { prisma } from "@/lib/prisma";
import { membersOf } from "@/lib/workspace";
import { notifyUsers } from "@/lib/notifications";

// Reemplaza las personas asignadas a un proyecto. Solo entran personas del mismo equipo.
// Devuelve a quiénes se agregó de nuevo (a ellas se les avisa por push).
export async function setProjectMembers(projectId: string, workspaceId: string, userIds: string[], actorName: string, noun: "proyecto" | "grupo" = "proyecto"): Promise<{ members: Array<{ id: string; name: string }>; added: string[] }> {
  const people = await membersOf(workspaceId);
  const valid = new Set(people.map((p) => p.id));
  const wanted = [...new Set(userIds)].filter((id) => valid.has(id));
  const current = (await prisma.projectMember.findMany({ where: { projectId }, select: { userId: true } })).map((m) => m.userId);
  const added = wanted.filter((id) => !current.includes(id));
  const removed = current.filter((id) => !wanted.includes(id));
  await prisma.$transaction([
    ...(removed.length ? [prisma.projectMember.deleteMany({ where: { projectId, userId: { in: removed } } })] : []),
    ...added.map((userId) => prisma.projectMember.create({ data: { projectId, userId } })),
  ]);
  if (added.length) {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
    void notifyUsers(added, { kind: "TEAM_ADDED", title: `${actorName} te agregó al ${noun} ${project?.name ?? ""}`.trim(), body: noun === "grupo" ? "Ahora tienes acceso a este grupo de tareas." : "Ahora eres parte del equipo de este proyecto.", url: `/projects/${projectId}/board`, groupKey: `project-${projectId}`, workspaceId });
  }
  return { members: people.filter((p) => wanted.includes(p.id)).map(({ id, name }) => ({ id, name })), added };
}

export async function listProjectMembers(projectId: string): Promise<Array<{ id: string; name: string }>> {
  const rows = await prisma.projectMember.findMany({ where: { projectId }, select: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: "asc" } } });
  return rows.map((r) => r.user);
}

// Personas a las que se puede asignar o involucrar en los tickets de un proyecto: todo el equipo, salvo en un
// grupo privado, donde solo quien lo creó y las personas con acceso.
export async function assignableMembers(projectId: string, workspaceId: string): Promise<Array<{ id: string; name: string }>> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { isPrivate: true, ownerId: true, members: { select: { userId: true } } } });
  const everyone = (await membersOf(workspaceId)).map(({ id, name }) => ({ id, name }));
  if (!project?.isPrivate) return everyone;
  const allowed = new Set([...(project.ownerId ? [project.ownerId] : []), ...project.members.map((m) => m.userId)]);
  return everyone.filter((p) => allowed.has(p.id));
}
