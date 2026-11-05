import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ projectMessage: (await params).id });
  if ("error" in auth) return auth.error;
  const { id } = await params;

  try {
    const message = await prisma.projectMessage.findUnique({ where: { id }, select: { authorId: true } });
    if (!message) return notFound("Mensaje no encontrado");
    if (message.authorId !== auth.user.id && auth.user.role !== "LEAD") {
      return NextResponse.json({ error: "Solo su autor o un líder puede borrar el mensaje" }, { status: 403 });
    }
    await prisma.projectMessage.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
