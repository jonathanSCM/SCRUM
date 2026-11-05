import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { parseBody, readJson, updateNoteSchema } from "@/lib/validation";
import { logHistory } from "@/lib/history";

// Las notas son públicas: cualquiera del equipo puede editarlas. Borrar solo
// su autor o un líder.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ note: (await params).id });
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = parseBody(updateNoteSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;

  try {
    const current = await prisma.note.findUnique({ where: { id }, select: { id: true } });
    if (!current) return notFound("Nota no encontrada");
    const note = await prisma.note.update({ where: { id }, data: parsed.data, include: { author: { select: { id: true, name: true } } } });
    return NextResponse.json(note);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ note: (await params).id });
  if ("error" in auth) return auth.error;
  const { id } = await params;

  try {
    const note = await prisma.note.findUnique({ where: { id }, select: { id: true, title: true, authorId: true, projectId: true } });
    if (!note) return notFound("Nota no encontrada");
    if (note.authorId !== auth.user.id && auth.user.role !== "LEAD") {
      return NextResponse.json({ error: "Solo su autor o un líder puede borrar la nota" }, { status: 403 });
    }
    await prisma.note.delete({ where: { id } });
    await logHistory({ projectId: note.projectId, field: "nota_eliminada", oldValue: note.title, actor: auth.user });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
