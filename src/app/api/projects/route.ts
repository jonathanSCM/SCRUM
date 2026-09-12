import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseBody, createProjectSchema } from "@/lib/validation";
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
};

// Igual patrón que PATCH /api/projects/[id]: se crea primero en el panel
// interno y solo se guarda acá si lo aceptó.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!isMainPanelConfigured()) {
    console.error("[projects] MAIN_PANEL_URL / MAIN_PANEL_API_TOKEN no configurados -- no se puede crear.");
    return NextResponse.json({ error: "No se pudo crear el proyecto. Probá de nuevo más tarde." }, { status: 400 });
  }

  const parsed = parseBody(createProjectSchema, await req.json());
  if ("error" in parsed) return parsed.error;

  let mainRes: Response;
  try {
    mainRes = await mainPanelFetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
  } catch (e) {
    console.error("[projects] error contactando al panel interno:", e);
    return NextResponse.json({ error: "No se pudo crear el proyecto. Probá de nuevo más tarde." }, { status: 502 });
  }

  if (!mainRes.ok) {
    const body = await mainRes.json().catch(() => ({}));
    console.error("[projects] el panel interno rechazó la creación:", body.error);
    return NextResponse.json(
      { error: "No se pudo crear el proyecto. Revisá los datos e intentá de nuevo." },
      { status: mainRes.status }
    );
  }

  const created: MainPanelProject = await mainRes.json();

  // El panel interno ya sincronizó este proyecto (vía syncToBoss) antes de
  // devolvernos la respuesta, así que puede que ya exista acá -- upsert en
  // vez de create para no chocar con esa carrera.
  const shared = {
    name: created.name,
    description: created.description,
    repoUrl: created.repoUrl,
    deployUrl: created.deployUrl,
    language: created.language,
    stack: created.stack,
    statusId: created.statusId,
  };
  const saved = await prisma.project.upsert({
    where: { id: created.id },
    create: { id: created.id, ...shared },
    update: shared,
    include: { status: true },
  });

  return NextResponse.json(saved, { status: 201 });
}
