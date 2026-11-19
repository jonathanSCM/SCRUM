import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { parseBody, readJson } from "@/lib/validation";
import { needsRebalance, rankBetween, rebalance } from "@/lib/scrum/rank";

const schema = z.object({
  projectId: z.string().min(1).max(40),
  prevId: z.string().min(1).max(40).nullish(), // el proyecto que queda justo arriba
  nextId: z.string().min(1).max(40).nullish(), // el que queda justo abajo
});

// Orden manual de los proyectos dentro de su fase del tablero (el mismo orden para todo el equipo). El cambio de fase se
// guarda aparte (PATCH /api/projects/[id]); esto solo coloca el proyecto entre dos vecinos.
export async function POST(req: Request) {
  const parsed = parseBody(schema, await readJson(req));
  if ("error" in parsed) return parsed.error;
  const { projectId, prevId, nextId } = parsed.data;
  const auth = await apiUser({ project: projectId });
  if ("error" in auth) return auth.error;
  try {
    const workspaceId = auth.user.workspaceId!;
    const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId, kind: "PROJECT" }, select: { id: true, statusId: true } });
    if (!project) return notFound("Proyecto no encontrado");
    // Los vecinos tienen que ser proyectos del mismo equipo y de la misma fase.
    const neighbors = await prisma.project.findMany({ where: { id: { in: [prevId, nextId].filter((x): x is string => !!x) }, workspaceId, kind: "PROJECT", statusId: project.statusId }, select: { id: true, rank: true } });
    const rankOf = (id?: string | null) => (id ? neighbors.find((n) => n.id === id)?.rank ?? null : null);
    if ((prevId && rankOf(prevId) === null) || (nextId && rankOf(nextId) === null)) return NextResponse.json({ error: "Los proyectos vecinos no están en esa fase" }, { status: 400 });

    let prev = rankOf(prevId);
    let next = rankOf(nextId);
    // Con ranks iguales (proyectos que nunca se ordenaron, todos en 0) no hay dónde insertar: se numera la fase entera
    // respetando el orden que se veía (por rank y luego por nombre) y se vuelve a leer.
    if ((prev !== null && next !== null && needsRebalance(prev, next)) || (prev !== null && prev === next) || prev === 0 || next === 0 || (prev === null && next === null)) {
      const siblings = await prisma.project.findMany({ where: { workspaceId, kind: "PROJECT", statusId: project.statusId }, orderBy: [{ rank: "asc" }, { name: "asc" }], select: { id: true } });
      await prisma.$transaction(rebalance(siblings.map((s) => s.id)).map((r) => prisma.project.update({ where: { id: r.id }, data: { rank: r.rank } })));
      const again = await prisma.project.findMany({ where: { id: { in: [prevId, nextId].filter((x): x is string => !!x) } }, select: { id: true, rank: true } });
      prev = prevId ? again.find((n) => n.id === prevId)?.rank ?? null : null;
      next = nextId ? again.find((n) => n.id === nextId)?.rank ?? null : null;
    }
    const rank = rankBetween(prev, next);
    await prisma.project.update({ where: { id: projectId }, data: { rank } });
    return NextResponse.json({ ok: true, rank });
  } catch (e) {
    return errorResponse(e);
  }
}
