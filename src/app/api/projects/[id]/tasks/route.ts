import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseBody, createTaskSchema } from "@/lib/validation";
import { mainPanelFetch, isMainPanelConfigured } from "@/lib/mainPanel";

type MainPanelTask = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  dueDate: string | null;
  assigneeId: string | null;
  assignee: { name: string } | null;
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!isMainPanelConfigured()) {
    console.error("[tasks] MAIN_PANEL_URL / MAIN_PANEL_API_TOKEN no configurados -- no se puede crear.");
    return NextResponse.json({ error: "No se pudo crear la tarea. Probá de nuevo más tarde." }, { status: 400 });
  }

  const { id: projectId } = await params;
  const parsed = parseBody(createTaskSchema, await req.json());
  if ("error" in parsed) return parsed.error;

  let mainRes: Response;
  try {
    mainRes = await mainPanelFetch(`/api/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
  } catch (e) {
    console.error("[tasks] error contactando al panel interno:", e);
    return NextResponse.json({ error: "No se pudo crear la tarea. Probá de nuevo más tarde." }, { status: 502 });
  }

  if (!mainRes.ok) {
    const body = await mainRes.json().catch(() => ({}));
    console.error("[tasks] el panel interno rechazó la creación:", body.error);
    return NextResponse.json(
      { error: "No se pudo crear la tarea. Revisá los datos e intentá de nuevo." },
      { status: mainRes.status }
    );
  }

  const created: MainPanelTask = await mainRes.json();

  // El panel interno ya sincronizó esta tarea (vía syncToBoss) antes de
  // devolvernos la respuesta, así que puede que ya exista acá -- upsert en
  // vez de create para no chocar con esa carrera.
  const shared = {
    projectId: created.projectId,
    title: created.title,
    description: created.description,
    type: created.type,
    priority: created.priority,
    dueDate: created.dueDate ? new Date(created.dueDate) : null,
    assigneeId: created.assigneeId,
    assigneeName: created.assignee?.name ?? null,
  };
  const saved = await prisma.task.upsert({
    where: { id: created.id },
    create: { id: created.id, ...shared },
    update: shared,
  });

  return NextResponse.json(saved, { status: 201 });
}
