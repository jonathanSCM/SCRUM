import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/session";
import { membershipOf } from "@/lib/workspace";
import { setActiveWorkspace } from "@/lib/activeWorkspace";
import { parseBody, readJson } from "@/lib/validation";

// Cambia el equipo activo (solo entre equipos de los que la persona es miembro).
export async function POST(req: Request) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const parsed = parseBody(z.object({ workspaceId: z.string().min(1).max(40) }), await readJson(req));
  if ("error" in parsed) return parsed.error;
  if (!(await membershipOf(auth.user.id, parsed.data.workspaceId))) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return setActiveWorkspace(NextResponse.json({ ok: true }), parsed.data.workspaceId);
}
