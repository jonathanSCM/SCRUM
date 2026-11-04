import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { createIssue } from "@/lib/issues";
import { formatIssueKey } from "@/lib/scrum/issueKey";
import { logHistory } from "@/lib/history";

// Convierte un acuerdo de la retro en una tarea del backlog.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  try {
    const item = await prisma.retroItem.findUnique({
      where: { id },
      include: { sprint: { select: { name: true } }, project: { select: { key: true } } },
    });
    if (!item) return notFound("No encontrado");
    if (item.column !== "ACTION") return NextResponse.json({ error: "Solo los acuerdos se convierten en tickets" }, { status: 400 });
    if (item.ticketKey) return NextResponse.json({ error: `Ya es el ticket ${item.ticketKey}` }, { status: 409 });

    const issue = await createIssue(
      item.projectId,
      { title: item.body.slice(0, 300), issueType: "TASK", description: `Acuerdo de la retro de «${item.sprint.name}».` },
      auth.user
    );
    const key = formatIssueKey(item.project.key, issue.number);
    await prisma.retroItem.update({ where: { id }, data: { ticketKey: key } });
    await logHistory({ projectId: item.projectId, field: "retro_a_ticket", oldValue: item.body.slice(0, 120), newValue: key, actor: auth.user });
    return NextResponse.json({ key });
  } catch (e) {
    return errorResponse(e);
  }
}
