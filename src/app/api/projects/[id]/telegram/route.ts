import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { parseBody, readJson, telegramConfigSchema } from "@/lib/validation";
import { logHistory } from "@/lib/history";

// Solo un líder configura Telegram. El token del bot funciona como una
// contraseña: nunca se devuelve, solo si hay uno guardado y cómo termina.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ lead: true });
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = parseBody(telegramConfigSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;
  const { botToken, chatId } = parsed.data;
  if (!!botToken !== !!chatId) {
    return NextResponse.json({ error: "Completá el token del bot y el chat, o dejá los dos vacíos para quitar Telegram" }, { status: 400 });
  }

  try {
    const project = await prisma.project.findUnique({ where: { id }, select: { telegramBotToken: true } });
    if (!project) return notFound("Proyecto no encontrado");

    await prisma.project.update({ where: { id }, data: { telegramBotToken: botToken || null, telegramChatId: chatId || null } });
    if (!!project.telegramBotToken !== !!botToken) {
      await logHistory({ projectId: id, field: "telegram_config", newValue: botToken ? "activado" : "desactivado", actor: auth.user });
    }
    return NextResponse.json({ configured: !!botToken, chatId: chatId || null, hint: botToken ? botToken.slice(-4) : null });
  } catch (e) {
    return errorResponse(e);
  }
}
