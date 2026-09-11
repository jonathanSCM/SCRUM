import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseBody, updateProjectSchema } from "@/lib/validation";
import { mainPanelFetch, isMainPanelConfigured } from "@/lib/mainPanel";

type MainPanelProject = {
  id: string;
  name: string;
  description: string;
  repoUrl: string | null;
  deployUrl: string | null;
  language: string | null;
  stack: string;
  statusId: string;
  assigneeId: string | null;
  assignee: { name: string } | null;
};

// Edición de dos vías: el cambio se manda primero al panel interno (con el
// token personal configurado en MAIN_PANEL_API_TOKEN) y solo se aplica acá
// si el panel interno lo aceptó -- así nunca queda una edición que solo
// exista de este lado y se pierda en el próximo sync.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!isMainPanelConfigured()) {
    return NextResponse.json(
      { error: "Falta configurar MAIN_PANEL_URL / MAIN_PANEL_API_TOKEN para poder editar desde acá." },
      { status: 400 }
    );
  }

  const { id } = await params;
  const parsed = parseBody(updateProjectSchema, await req.json());
  if ("error" in parsed) return parsed.error;

  let mainRes: Response;
  try {
    mainRes = await mainPanelFetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo contactar el panel interno" }, { status: 502 });
  }

  if (!mainRes.ok) {
    const body = await mainRes.json().catch(() => ({}));
    return NextResponse.json({ error: body.error || "El panel interno rechazó el cambio" }, { status: mainRes.status });
  }

  const updated: MainPanelProject = await mainRes.json();

  const saved = await prisma.project.update({
    where: { id },
    data: {
      name: updated.name,
      description: updated.description,
      repoUrl: updated.repoUrl,
      deployUrl: updated.deployUrl,
      language: updated.language,
      stack: updated.stack,
      statusId: updated.statusId,
      assigneeId: updated.assigneeId,
      assigneeName: updated.assignee?.name ?? null,
    },
    include: { status: true },
  });

  return NextResponse.json(saved);
}
