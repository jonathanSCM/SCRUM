import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { parseBody, readJson, updateSprintSchema } from "@/lib/validation";
import { logHistory } from "@/lib/history";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = parseBody(updateSprintSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  try {
    const sprint = await prisma.sprint.findUnique({ where: { id } });
    if (!sprint) return notFound("Sprint no encontrado");
    if (sprint.state === "COMPLETED") return NextResponse.json({ error: "Un sprint completado no se puede editar" }, { status: 400 });

    const startDate = body.startDate !== undefined ? (body.startDate ? new Date(body.startDate) : null) : sprint.startDate;
    const endDate = body.endDate !== undefined ? (body.endDate ? new Date(body.endDate) : null) : sprint.endDate;
    if (startDate && endDate && endDate.getTime() <= startDate.getTime()) {
      return NextResponse.json({ error: "La fecha de fin tiene que ser posterior a la de inicio" }, { status: 400 });
    }

    const updated = await prisma.sprint.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.goal !== undefined ? { goal: body.goal } : {}),
        startDate,
        endDate,
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    return errorResponse(e);
  }
}

// Borrar un sprint (solo líder). Sus tickets vuelven al backlog. Un sprint
// activo hay que completarlo primero.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ lead: true });
  if ("error" in auth) return auth.error;
  const { id } = await params;

  try {
    const sprint = await prisma.sprint.findUnique({ where: { id } });
    if (!sprint) return notFound("Sprint no encontrado");
    if (sprint.state === "ACTIVE") return NextResponse.json({ error: "Completá el sprint antes de borrarlo" }, { status: 400 });

    await prisma.$transaction([
      prisma.task.updateMany({ where: { sprintId: id }, data: { sprintId: null, sprintAddedAt: null } }),
      prisma.sprint.delete({ where: { id } }),
    ]);
    if (sprint.projectId) await logHistory({ projectId: sprint.projectId, field: "sprint_eliminado", oldValue: sprint.name, actor: auth.user });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
