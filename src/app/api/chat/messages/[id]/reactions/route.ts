import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { chatReactionSchema, parseBody, readJson } from "@/lib/validation";
import { CHAT_EMOJIS, QUICK_REACTIONS } from "@/lib/scrum/chat";
import { messageInclude, toDTOs } from "@/lib/chatData";

const ALLOWED = new Set([...QUICK_REACTIONS, ...CHAT_EMOJIS]);

// Pone o quita MI reacción con ese emoji. Devuelve el mensaje actualizado.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const parsed = parseBody(chatReactionSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;
  const { emoji } = parsed.data;
  if (!ALLOWED.has(emoji)) return NextResponse.json({ error: "Emoji no disponible" }, { status: 400 });

  try {
    const message = await prisma.chatMessage.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
    if (!message || message.deletedAt) return notFound("Mensaje no encontrado");

    const existing = await prisma.chatReaction.findUnique({ where: { messageId_userId_emoji: { messageId: id, userId: auth.user.id, emoji } } });
    if (existing) await prisma.chatReaction.delete({ where: { id: existing.id } });
    else await prisma.chatReaction.create({ data: { messageId: id, userId: auth.user.id, emoji } });
    // Mueve updatedAt para que los demás vean el cambio en su próximo refresco.
    const updated = await prisma.chatMessage.update({ where: { id }, data: { updatedAt: new Date() }, include: messageInclude });
    const [dto] = await toDTOs([updated]);
    return NextResponse.json(dto);
  } catch (e) {
    return errorResponse(e);
  }
}
