import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { discordWebhookSchema, parseBody, readJson } from "@/lib/validation";
import { logHistory } from "@/lib/history";

// Solo un líder puede configurar el webhook. La URL funciona como una
// contraseña (cualquiera con ella puede escribir en el canal), así que nunca
// se devuelve completa: solo si hay una guardada y cómo termina.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ lead: true, project: (await params).id });
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = parseBody(discordWebhookSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;
  const url = parsed.data.discordWebhookUrl ? parsed.data.discordWebhookUrl : null;

  try {
    const project = await prisma.project.findUnique({ where: { id }, select: { discordWebhookUrl: true } });
    if (!project) return notFound("Proyecto no encontrado");

    await prisma.project.update({ where: { id }, data: { discordWebhookUrl: url } });
    if (!!project.discordWebhookUrl !== !!url) {
      await logHistory({ projectId: id, field: "discord_webhook", newValue: url ? "activado" : "desactivado", actor: auth.user });
    }
    return NextResponse.json({ configured: !!url, hint: url ? url.slice(-6) : null });
  } catch (e) {
    return errorResponse(e);
  }
}
