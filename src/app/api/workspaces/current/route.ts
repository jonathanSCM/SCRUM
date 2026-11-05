import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { parseBody, readJson } from "@/lib/validation";

// Cambia el nombre del equipo activo (dueño o admin). La dirección (slug) no cambia.
export async function PATCH(req: Request) {
  const auth = await apiUser({ workspace: true, lead: true });
  if ("error" in auth) return auth.error;
  const parsed = parseBody(z.object({ name: z.string().trim().min(2).max(60) }), await readJson(req));
  if ("error" in parsed) return parsed.error;
  try {
    const ws = await prisma.workspace.update({ where: { id: auth.user.workspaceId! }, data: { name: parsed.data.name }, select: { id: true, name: true } });
    return NextResponse.json(ws);
  } catch (e) {
    return errorResponse(e);
  }
}
