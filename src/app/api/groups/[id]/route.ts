import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { parseBody, readJson, updateGroupSchema } from "@/lib/validation";
import { canManageGroup, groupSelect } from "@/lib/groups";
import { logHistory } from "@/lib/history";

async function loadGroup(id: string) {
  const g = await prisma.project.findUnique({ where: { id }, select: { ...groupSelect, kind: true } });
  return g && g.kind === "GROUP" ? g : null;
}

// Renombrar, hacer privado o del equipo, archivar o restaurar. Solo quien creó el grupo y los líderes.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ project: id });
  if ("error" in auth) return auth.error;
  const parsed = parseBody(updateGroupSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;
  try {
    const group = await loadGroup(id);
    if (!group) return notFound("Grupo no encontrado");
    if (!canManageGroup(auth.user, group)) return NextResponse.json({ error: "Solo quien creó el grupo o un líder puede cambiarlo" }, { status: 403 });
    if (group.convertedToId) return NextResponse.json({ error: "Este grupo ya se convirtió en proyecto" }, { status: 400 });
    const { name, isPrivate, archived } = parsed.data;
    const updated = await prisma.project.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(isPrivate !== undefined ? { isPrivate } : {}),
        ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}),
      },
      select: { id: true, name: true, isPrivate: true, archivedAt: true },
    });
    if (archived !== undefined && archived !== !!group.archivedAt) await logHistory({ projectId: id, field: archived ? "grupo_archivado" : "grupo_restaurado", newValue: updated.name, actor: auth.user });
    return NextResponse.json(updated);
  } catch (e) {
    return errorResponse(e);
  }
}

// Borra el grupo con todas sus tareas. Solo quien lo creó y los líderes.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ project: id });
  if ("error" in auth) return auth.error;
  try {
    const group = await loadGroup(id);
    if (!group) return notFound("Grupo no encontrado");
    if (!canManageGroup(auth.user, group)) return NextResponse.json({ error: "Solo quien creó el grupo o un líder puede borrarlo" }, { status: 403 });
    await prisma.project.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
