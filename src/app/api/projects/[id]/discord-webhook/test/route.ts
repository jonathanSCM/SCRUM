import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { DISCORD_COLOR, sendToDiscordWebhook } from "@/lib/discord";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ lead: true, project: (await params).id });
  if ("error" in auth) return auth.error;
  const { id } = await params;

  try {
    const project = await prisma.project.findUnique({ where: { id }, select: { name: true, discordWebhookUrl: true } });
    if (!project) return notFound("Proyecto no encontrado");
    if (!project.discordWebhookUrl) return NextResponse.json({ error: "Este proyecto todavía no tiene un webhook guardado" }, { status: 400 });

    const ok = await sendToDiscordWebhook(project.discordWebhookUrl, {
      title: "Mensaje de prueba",
      description: `Esto es una prueba desde SCRUM ProShop para el proyecto «${project.name}». Si ves esto, el webhook está bien configurado.`,
      color: DISCORD_COLOR.test,
    });
    if (!ok) return NextResponse.json({ error: "Discord no aceptó el mensaje. Revisá que la URL del webhook siga siendo válida." }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
