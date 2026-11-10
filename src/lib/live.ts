import { prisma } from "@/lib/prisma";

// "Versión" barata de un conjunto de datos: cambia cuando se crea, edita o borra algo.
// El navegador la consulta cada pocos segundos y solo recarga la vista si cambió.
const stamp = (d: Date | null | undefined) => (d ? d.getTime() : 0);

export async function workspaceProjectsVersion(workspaceId: string): Promise<string> {
  const [p, t, s] = await Promise.all([
    prisma.project.aggregate({ where: { workspaceId }, _max: { updatedAt: true }, _count: { _all: true } }),
    prisma.task.aggregate({ where: { project: { workspaceId } }, _max: { updatedAt: true }, _count: { _all: true } }),
    prisma.sprint.count({ where: { project: { workspaceId }, state: "ACTIVE" } }),
  ]);
  return [stamp(p._max.updatedAt), p._count._all, stamp(t._max.updatedAt), t._count._all, s].join(".");
}

export async function projectVersion(projectId: string): Promise<string> {
  const [p, t, s] = await Promise.all([
    prisma.project.aggregate({ where: { id: projectId }, _max: { updatedAt: true } }),
    prisma.task.aggregate({ where: { projectId }, _max: { updatedAt: true }, _count: { _all: true } }),
    prisma.sprint.findMany({ where: { projectId }, select: { id: true, state: true } }),
  ]);
  return [stamp(p._max.updatedAt), stamp(t._max.updatedAt), t._count._all, s.map((x) => `${x.id}${x.state}`).join(",").length, s.filter((x) => x.state === "ACTIVE").length].join(".");
}
