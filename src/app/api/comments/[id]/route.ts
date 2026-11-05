import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { commentSchema, parseBody, readJson } from "@/lib/validation";

// Solo el autor (o un líder) puede editar o borrar un comentario.
async function loadForWrite(id: string, user: { id: string; role: string }) {
  const comment = await prisma.comment.findUnique({ where: { id }, select: { id: true, authorId: true } });
  if (!comment) return { error: notFound("Comentario no encontrado") };
  if (comment.authorId !== user.id && user.role !== "LEAD") {
    return { error: NextResponse.json({ error: "Solo quien lo escribió puede modificarlo" }, { status: 403 }) };
  }
  return { comment };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ comment: (await params).id });
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = parseBody(commentSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;

  try {
    const loaded = await loadForWrite(id, auth.user);
    if ("error" in loaded) return loaded.error;
    const updated = await prisma.comment.update({
      where: { id },
      data: { body: parsed.data.body },
      include: { author: { select: { id: true, name: true } } },
    });
    return NextResponse.json(updated);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ comment: (await params).id });
  if ("error" in auth) return auth.error;
  const { id } = await params;

  try {
    const loaded = await loadForWrite(id, auth.user);
    if ("error" in loaded) return loaded.error;
    await prisma.comment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
