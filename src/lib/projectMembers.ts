import "server-only";
import { prisma } from "@/lib/prisma";
import { membersOf } from "@/lib/workspace";
import { sendPush } from "@/lib/push";

// Reemplaza las personas asignadas a un proyecto. Solo entran personas del mismo equipo.
// Devuelve a quiénes se agregó de nuevo (a ellas se les avisa por push).
export async function setProjectMembers(projectId: string, workspaceId: string, userIds: string[], actorName: string): Promise<{ members: Array<{ id: string; name: string }>; added: string[] }> {
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
    void sendPush(added, { title: `${actorName} te agregó al proyecto ${project?.name ?? ""}`.trim(), body: "Ahora eres parte del equipo de este proyecto.", url: `/projects/${projectId}/board`, tag: `project-${projectId}` });
  }
  return { members: people.filter((p) => wanted.includes(p.id)).map(({ id, name }) => ({ id, name })), added };
}

export async function listProjectMembers(projectId: string): Promise<Array<{ id: string; name: string }>> {
  const rows = await prisma.projectMember.findMany({ where: { projectId }, select: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: "asc" } } });
  return rows.map((r) => r.user);
}
