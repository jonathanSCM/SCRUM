import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { parseBody, readJson } from "@/lib/validation";
import { canManageGroup } from "@/lib/groups";
import { setProjectMembers, listProjectMembers } from "@/lib/projectMembers";

// Quién tiene acceso a un grupo privado (además de quien lo creó).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ project: id });
  if ("error" in auth) return auth.error;
  try {
    const group = await prisma.project.findUnique({ where: { id }, select: { kind: true } });
    if (group?.kind !== "GROUP") return notFound("Grupo no encontrado");
    return NextResponse.json({ members: await listProjectMembers(id) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ project: id });
  if ("error" in auth) return auth.error;
  const parsed = parseBody(z.object({ userIds: z.array(z.string().min(1).max(40)).max(100) }), await readJson(req));
  if ("error" in parsed) return parsed.error;
  try {
    const group = await prisma.project.findUnique({ where: { id }, select: { kind: true, ownerId: true } });
    if (group?.kind !== "GROUP") return notFound("Grupo no encontrado");
    if (!canManageGroup(auth.user, group)) return NextResponse.json({ error: "Solo quien creó el grupo o un líder puede dar acceso" }, { status: 403 });
    const res = await setProjectMembers(id, auth.user.workspaceId!, parsed.data.userIds.filter((u) => u !== group.ownerId), auth.user.name, "grupo");
    return NextResponse.json({ members: res.members });
  } catch (e) {
    return errorResponse(e);
  }
}
