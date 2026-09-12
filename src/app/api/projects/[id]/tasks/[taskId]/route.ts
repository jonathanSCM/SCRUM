import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseBody, updateTaskSchema } from "@/lib/validation";
import { mainPanelFetch, isMainPanelConfigured } from "@/lib/mainPanel";

type MainPanelTask = {
  id: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  dueDate: string | null;
  assigneeId: string | null;
  assignee: { name: string } | null;
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!isMainPanelConfigured()) {
    console.error("[tasks] MAIN_PANEL_URL / MAIN_PANEL_API_TOKEN no configurados -- no se puede editar.");
    return NextResponse.json({ error: "No se pudo guardar el cambio. Probá de nuevo más tarde." }, { status: 400 });
  }

  const { id: projectId, taskId } = await params;
  const parsed = parseBody(updateTaskSchema, await req.json());
  if ("error" in parsed) return parsed.error;

  let mainRes: Response;
  try {
    mainRes = await mainPanelFetch(`/api/projects/${projectId}/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
  } catch (e) {
    console.error("[tasks] error contactando al panel interno:", e);
    return NextResponse.json({ error: "No se pudo guardar el cambio. Probá de nuevo más tarde." }, { status: 502 });
  }

  if (!mainRes.ok) {
    const body = await mainRes.json().catch(() => ({}));
    console.error("[tasks] el panel interno rechazó el cambio:", body.error);
    return NextResponse.json(
      { error: "No se pudo guardar el cambio. Revisá los datos e intentá de nuevo." },
      { status: mainRes.status }
    );
  }

  const updated: MainPanelTask = await mainRes.json();

  const saved = await prisma.task.update({
    where: { id: taskId },
    data: {
      title: updated.title,
      description: updated.description,
      type: updated.type,
      priority: updated.priority,
      dueDate: updated.dueDate ? new Date(updated.dueDate) : null,
      assigneeId: updated.assigneeId,
      assigneeName: updated.assignee?.name ?? null,
    },
  });

  return NextResponse.json(saved);
}
