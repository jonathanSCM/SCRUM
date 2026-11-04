import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { completeSprintSchema, parseBody, readJson } from "@/lib/validation";
import { logHistory } from "@/lib/history";
import { notifyDiscord, DISCORD_COLOR } from "@/lib/discord";
import { planCompletion } from "@/lib/scrum/sprintLifecycle";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = parseBody(completeSprintSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;

  try {
    const sprint = await prisma.sprint.findUnique({ where: { id }, include: { project: { select: { id: true, name: true } } } });
    if (!sprint || !sprint.projectId || !sprint.project) return notFound("Sprint no encontrado");
    if (sprint.state !== "ACTIVE") return NextResponse.json({ error: "Solo se puede completar un sprint activo" }, { status: 400 });

    let destinationSprintId: string | null = null;
    if (parsed.data.destination !== "BACKLOG") {
      const dest = await prisma.sprint.findUnique({ where: { id: parsed.data.destination }, select: { projectId: true, state: true } });
      if (!dest || dest.projectId !== sprint.projectId || dest.state !== "PLANNED") {
        return NextResponse.json({ error: "El sprint de destino tiene que estar planificado y ser de este proyecto" }, { status: 400 });
      }
      destinationSprintId = parsed.data.destination;
    }

    const tasks = await prisma.task.findMany({ where: { sprintId: id, issueType: { not: "EPIC" } }, select: { id: true, status: true, storyPoints: true } });
    const plan = planCompletion(tasks, destinationSprintId);
    const now = new Date();

    await prisma.$transaction([
      prisma.task.updateMany({
        where: { id: { in: plan.unfinishedIds } },
        data: { sprintId: plan.destinationSprintId, sprintAddedAt: plan.destinationSprintId ? now : null },
      }),
      prisma.sprint.update({
        where: { id },
        data: { state: "COMPLETED", completedAt: now, completedPoints: plan.completedPoints, completedCount: plan.completedCount },
      }),
    ]);

    await logHistory({
      projectId: sprint.projectId,
      field: "sprint_completado",
      newValue: sprint.name,
      oldValue: `${plan.completedCount}/${tasks.length} tickets`,
      actor: auth.user,
    });
    await notifyDiscord(sprint.projectId, {
      title: `🏁 Sprint completado: ${sprint.name}`,
      description: `**${auth.user.name}** cerró el sprint en ${sprint.project.name}.`,
      color: DISCORD_COLOR.sprintCompleted,
      fields: [
        { name: "Completados", value: `${plan.completedCount}/${tasks.length}`, inline: true },
        { name: "Puntos hechos", value: `${plan.completedPoints}/${sprint.committedPoints}`, inline: true },
        { name: "Pendientes", value: plan.destinationSprintId ? "Pasaron al siguiente sprint" : "Volvieron al backlog", inline: true },
      ],
    });

    return NextResponse.json({ ok: true, completed: plan.completedCount, moved: plan.unfinishedIds.length });
  } catch (e) {
    return errorResponse(e);
  }
}
