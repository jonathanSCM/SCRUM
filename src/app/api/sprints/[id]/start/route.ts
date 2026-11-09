import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { parseBody, readJson, startSprintSchema } from "@/lib/validation";
import { logHistory } from "@/lib/history";
import { DISCORD_COLOR } from "@/lib/discord";
import { notifyProject } from "@/lib/notify";
import { parseStringList, ticketsNotReady } from "@/lib/scrum/ready";
import { formatIssueKey } from "@/lib/scrum/issueKey";
import { sprintPdfEnabled } from "@/lib/features";
import { sendSprintBriefing } from "@/lib/sprintBriefing";
import { snapshotOnStart, validateStart } from "@/lib/scrum/sprintLifecycle";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ sprint: (await params).id });
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = parseBody(startSprintSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;

  try {
    const sprint = await prisma.sprint.findUnique({ where: { id }, include: { project: { select: { id: true, name: true, key: true, readyItems: true } } } });
    if (!sprint || !sprint.projectId || !sprint.project) return notFound("Sprint no encontrado");

    const name = parsed.data.name ?? sprint.name;
    const startDate = new Date(parsed.data.startDate);
    const endDate = new Date(parsed.data.endDate);
    const otherActive = await prisma.sprint.count({ where: { projectId: sprint.projectId, state: "ACTIVE", id: { not: id } } });

    const problem = validateStart({ name, startDate, endDate, state: sprint.state, hasOtherActiveSprint: otherActive > 0 });
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    const tasks = await prisma.task.findMany({ where: { sprintId: id, issueType: { not: "EPIC" } }, select: { id: true, number: true, title: true, readyDone: true, status: true, storyPoints: true } });

    // Definition of Ready: no se inicia con tickets a los que les falta información,
    // salvo que un líder lo fuerce.
    const notReady = ticketsNotReady(
      parseStringList(sprint.project.readyItems),
      tasks.map((t) => ({ key: formatIssueKey(sprint.project!.key, t.number), title: t.title, readyDone: parseStringList(t.readyDone) }))
    );
    if (notReady.length > 0) {
      if (!parsed.data.force) {
        return NextResponse.json(
          { error: `${notReady.length} ${notReady.length === 1 ? "ticket no cumple" : "tickets no cumplen"} la Definition of Ready: ${notReady.slice(0, 5).map((t) => t.key).join(", ")}${notReady.length > 5 ? "…" : ""}`, notReady },
          { status: 400 }
        );
      }
      if (auth.user.role !== "LEAD") return NextResponse.json({ error: "Solo un líder puede iniciar un sprint sin cumplir la Definition of Ready" }, { status: 403 });
    }
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
    if (notReady.length > 0) await logHistory({ projectId: sprint.projectId, field: "sprint_iniciado_sin_ready", newValue: `${name}: ${notReady.length} tickets sin DoR`, actor: auth.user });
    await notifyProject(sprint.projectId, {
      title: `Sprint iniciado: ${name}`,
      description: `**${auth.user.name}** inició el sprint en ${sprint.project.name}.${started.goal ? `\n**Objetivo:** ${started.goal}` : ""}`,
      color: DISCORD_COLOR.sprintStarted,
      pushAll: true,
      kind: "SPRINT_START",
      excludeUserId: auth.user.id,
      fields: [
        { name: "Tickets", value: String(snapshot.committedCount), inline: true },
        { name: "Puntos", value: String(snapshot.committedPoints), inline: true },
        { name: "Termina", value: endDate.toLocaleDateString("es-AR", { timeZone: "UTC" }), inline: true },
      ],
    });

    // Informe PDF (con sugerencias de Gemini) al Slack del proyecto, sin hacer
    // esperar a quien inició el sprint. Solo si SPRINT_PDF_ENABLED=true.
    if (sprintPdfEnabled()) {
      after(async () => {
        await sendSprintBriefing(id, auth.user);
      });
    }

    return NextResponse.json(started);
  } catch (e) {
    return errorResponse(e);
  }
}
