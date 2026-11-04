import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { parseBody, readJson, slackWebhookSchema } from "@/lib/validation";
import { logHistory } from "@/lib/history";

// Solo un líder configura Slack. La URL del webhook funciona como una
// contraseña: nunca se devuelve completa.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ lead: true });
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = parseBody(slackWebhookSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;
  const { slackWebhookUrl, slackChannelId } = parsed.data;

  try {
    const project = await prisma.project.findUnique({ where: { id }, select: { slackWebhookUrl: true, slackChannelId: true } });
    if (!project) return notFound("Proyecto no encontrado");
    // Solo se tocan los campos que vienen en la petición.
    const data: { slackWebhookUrl?: string | null; slackChannelId?: string | null } = {};
    if (slackWebhookUrl !== undefined) data.slackWebhookUrl = slackWebhookUrl || null;
    if (slackChannelId !== undefined) data.slackChannelId = slackChannelId || null;
    const updated = await prisma.project.update({ where: { id }, data, select: { slackWebhookUrl: true, slackChannelId: true } });
    if (!!project.slackWebhookUrl !== !!updated.slackWebhookUrl) {
      await logHistory({ projectId: id, field: "slack_webhook", newValue: updated.slackWebhookUrl ? "activado" : "desactivado", actor: auth.user });
    }
    return NextResponse.json({
      configured: !!updated.slackWebhookUrl,
      hint: updated.slackWebhookUrl ? updated.slackWebhookUrl.slice(-6) : null,
      channelId: updated.slackChannelId,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
