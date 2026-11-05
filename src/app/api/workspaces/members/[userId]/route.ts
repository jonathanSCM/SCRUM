import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { canChangeRole, normalizeRole, WS_ROLES } from "@/lib/scrum/roles";
import { parseBody, readJson } from "@/lib/validation";

// Cambia el rol de una persona dentro del equipo activo.
export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await apiUser({ workspace: true, lead: true });
  if ("error" in auth) return auth.error;
  const { userId } = await params;
  const parsed = parseBody(z.object({ role: z.enum(WS_ROLES) }), await readJson(req));
  if ("error" in parsed) return parsed.error;
  const workspaceId = auth.user.workspaceId!;

  try {
    const target = await prisma.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
    if (!target) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    const owners = await prisma.membership.count({ where: { workspaceId, role: "OWNER" } });
    const verdict = canChangeRole(auth.user.wsRole ?? "MEMBER", normalizeRole(target.role), parsed.data.role, owners);
    if (!verdict.ok) return NextResponse.json({ error: verdict.reason }, { status: 403 });
    await prisma.membership.update({ where: { id: target.id }, data: { role: parsed.data.role } });
    return NextResponse.json({ ok: true, role: parsed.data.role });
  } catch (e) {
    return errorResponse(e);
  }
}
