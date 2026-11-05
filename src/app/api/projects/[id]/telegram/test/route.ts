import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { sendToTelegram } from "@/lib/telegram";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ lead: true, project: (await params).id });
  if ("error" in auth) return auth.error;
  const { id } = await params;

  try {
    const project = await prisma.project.findUnique({ where: { id }, select: { name: true, telegramBotToken: true, telegramChatId: true } });
    if (!project) return notFound("Proyecto no encontrado");
    if (!project.telegramBotToken || !project.telegramChatId) {
      return NextResponse.json({ error: "Este proyecto todavía no tiene Telegram configurado" }, { status: 400 });
    }
    const ok = await sendToTelegram(project.telegramBotToken, project.telegramChatId, {
      title: "Mensaje de prueba",
      description: `Esto es una prueba desde SCRUM ProShop para el proyecto «${project.name}». Si ves esto, Telegram está bien configurado.`,
    });
    if (!ok) {
      return NextResponse.json({ error: "Telegram no aceptó el mensaje. Revisá el token y que el bot esté agregado al chat." }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
