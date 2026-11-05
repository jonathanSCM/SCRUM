import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { ensureChannels } from "@/lib/chatChannels";

// Borra un canal propio (no "General" ni "Reuniones"). Sus mensajes pasan a "General": no se pierde nada.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ channel: id, lead: true });
  if ("error" in auth) return auth.error;
  try {
    const ch = await prisma.chatChannel.findUnique({ where: { id }, select: { kind: true, workspaceId: true } });
    if (!ch) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (ch.kind !== "CUSTOM") return NextResponse.json({ error: "Los canales General y Reuniones no se borran" }, { status: 400 });
    const general = (await ensureChannels(ch.workspaceId)).find((c) => c.kind === "GENERAL");
    await prisma.$transaction([
      prisma.chatMessage.updateMany({ where: { channelId: id }, data: { channelId: general?.id ?? null } }),
      prisma.chatChannel.delete({ where: { id } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
