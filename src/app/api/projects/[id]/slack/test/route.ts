import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { sendToSlackWebhook } from "@/lib/slack";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ lead: true });
  if ("error" in auth) return auth.error;
  const { id } = await params;

  try {
    const project = await prisma.project.findUnique({ where: { id }, select: { name: true, slackWebhookUrl: true } });
    if (!project) return notFound("Proyecto no encontrado");
    if (!project.slackWebhookUrl) return NextResponse.json({ error: "Este proyecto todavía no tiene un webhook de Slack guardado" }, { status: 400 });
    const ok = await sendToSlackWebhook(project.slackWebhookUrl, {
      title: "Mensaje de prueba",
      description: `Esto es una prueba desde SCRUM ProShop para el proyecto «${project.name}». Si ves esto, Slack está bien configurado.`,
    });
    if (!ok) return NextResponse.json({ error: "Slack no aceptó el mensaje. Revisá que la URL del webhook siga siendo válida." }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
