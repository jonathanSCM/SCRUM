import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { parseBody, readJson, startSprintSchema } from "@/lib/validation";
import { logHistory } from "@/lib/history";
import { notifyDiscord, DISCORD_COLOR } from "@/lib/discord";
import { snapshotOnStart, validateStart } from "@/lib/scrum/sprintLifecycle";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = parseBody(startSprintSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;

  try {
    const sprint = await prisma.sprint.findUnique({ where: { id }, include: { project: { select: { id: true, name: true } } } });
    if (!sprint || !sprint.projectId || !sprint.project) return notFound("Sprint no encontrado");

    const name = parsed.data.name ?? sprint.name;
    const startDate = new Date(parsed.data.startDate);
    const endDate = new Date(parsed.data.endDate);
    const otherActive = await prisma.sprint.count({ where: { projectId: sprint.projectId, state: "ACTIVE", id: { not: id } } });

    const problem = validateStart({ name, startDate, endDate, state: sprint.state, hasOtherActiveSprint: otherActive > 0 });
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    const tasks = await prisma.task.findMany({ where: { sprintId: id, issueType: { not: "EPIC" } }, select: { id: true, status: true, storyPoints: true } });
    const snapshot = snapshotOnStart(tasks);
    const now = new Date();

    // Lo que ya estaba en el sprint al iniciarlo cuenta como "comprometido":
    // sprintAddedAt vuelve a null para que no se confunda con alcance agregado.
    const [started] = await prisma.$transaction([
      prisma.sprint.update({
        where: { id },
        data: { name, goal: parsed.data.goal ?? sprint.goal, startDate, endDate, state: "ACTIVE", startedAt: now, ...snapshot },
      }),
      prisma.task.updateMany({ where: { sprintId: id }, data: { sprintAddedAt: null } }),
    ]);

    await logHistory({ projectId: sprint.projectId, field: "sprint_iniciado", newValue: name, actor: auth.user });
    await notifyDiscord(sprint.projectId, {
      title: `🚀 Sprint iniciado: ${name}`,
      description: `**${auth.user.name}** inició el sprint en ${sprint.project.name}.${started.goal ? `\n**Objetivo:** ${started.goal}` : ""}`,
      color: DISCORD_COLOR.sprintStarted,
      fields: [
        { name: "Tickets", value: String(snapshot.committedCount), inline: true },
        { name: "Puntos", value: String(snapshot.committedPoints), inline: true },
        { name: "Termina", value: endDate.toLocaleDateString("es-AR", { timeZone: "UTC" }), inline: true },
      ],
    });

    return NextResponse.json(started);
  } catch (e) {
    return errorResponse(e);
  }
}
