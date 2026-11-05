import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";

// Borrado "suave", como WhatsApp: el mensaje queda como "Mensaje eliminado" (así las
// respuestas que lo citan no quedan huérfanas), pero se pierde el texto, los archivos y las reacciones.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  try {
    const message = await prisma.chatMessage.findUnique({ where: { id }, select: { authorId: true, deletedAt: true } });
    if (!message) return notFound("Mensaje no encontrado");
    if (message.authorId !== auth.user.id && auth.user.role !== "LEAD") {
      return NextResponse.json({ error: "Solo su autor o un líder puede borrar el mensaje" }, { status: 403 });
    }
    if (message.deletedAt) return NextResponse.json({ ok: true });
    await prisma.$transaction([
      prisma.chatFile.deleteMany({ where: { messageId: id } }),
      prisma.chatReaction.deleteMany({ where: { messageId: id } }),
      prisma.chatMessage.update({ where: { id }, data: { body: "", deletedAt: new Date() } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
