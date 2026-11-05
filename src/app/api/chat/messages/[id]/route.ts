import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";

// Borra el mensaje de verdad (con sus archivos, reacciones y referencias).
// Las respuestas que lo citaban quedan como mensajes normales, sin la cita.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ chatMessage: (await params).id });
  if ("error" in auth) return auth.error;
  const { id } = await params;

  try {
    const message = await prisma.chatMessage.findUnique({ where: { id }, select: { authorId: true } });
    if (!message) return NextResponse.json({ ok: true }); // ya no existe: nada que hacer
    if (message.authorId !== auth.user.id && auth.user.role !== "LEAD") {
      return NextResponse.json({ error: "Solo su autor o un líder puede borrar el mensaje" }, { status: 403 });
    }
    await prisma.$transaction([
      // Se suelta la cita explícitamente (y se mueve updatedAt) para que los demás vean el cambio.
      prisma.chatMessage.updateMany({ where: { replyToId: id }, data: { replyToId: null, updatedAt: new Date() } }),
      prisma.chatMessage.delete({ where: { id } }),
      prisma.chatDeletion.upsert({ where: { messageId: id }, create: { messageId: id, workspaceId: auth.user.workspaceId! }, update: { deletedAt: new Date() } }),
      prisma.chatDeletion.deleteMany({ where: { deletedAt: { lt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
