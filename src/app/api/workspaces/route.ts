import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { activeAccess } from "@/lib/workspace";
import { createWorkspace } from "@/lib/workspaceAdmin";
import { setActiveWorkspace } from "@/lib/activeWorkspace";
import { maxOwnedTeams, normalizeRole } from "@/lib/scrum/roles";
import { parseBody, readJson } from "@/lib/validation";

// Mis equipos (y cuál está activo).
export async function GET() {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  try {
    const [rows, active] = await Promise.all([
      prisma.membership.findMany({ where: { userId: auth.user.id }, orderBy: { createdAt: "asc" }, select: { role: true, workspace: { select: { id: true, name: true, slug: true } } } }),
      activeAccess(auth.user.id),
    ]);
    return NextResponse.json(rows.map((r) => ({ ...r.workspace, role: normalizeRole(r.role), active: r.workspace.id === active?.workspaceId })));
  } catch (e) {
    return errorResponse(e);
  }
}

// Crear un equipo nuevo: quien lo crea es su dueño. Hay un tope de equipos propios por cuenta.
export async function POST(req: Request) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const parsed = parseBody(z.object({ name: z.string().trim().min(2, "Poné un nombre de al menos 2 letras").max(60) }), await readJson(req));
  if ("error" in parsed) return parsed.error;

  try {
    const limit = maxOwnedTeams(process.env.MAX_OWNED_TEAMS);
    const owned = await prisma.membership.count({ where: { userId: auth.user.id, role: "OWNER" } });
    if (owned >= limit) return NextResponse.json({ error: `Ya sos dueño de ${owned} equipos (el máximo es ${limit}).` }, { status: 400 });

    const workspace = await createWorkspace(parsed.data.name, auth.user.id);
    return setActiveWorkspace(NextResponse.json({ id: workspace.id, name: workspace.name, slug: workspace.slug }, { status: 201 }), workspace.id);
  } catch (e) {
    return errorResponse(e);
  }
}
