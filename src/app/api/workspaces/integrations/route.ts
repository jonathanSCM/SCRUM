import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { encryptSecret } from "@/lib/secretBox";
import { SLACK_BOT_TOKEN_PATTERN, SLACK_WEBHOOK_PATTERN } from "@/lib/slack";
import { geminiKeyFor, openaiKeyFor, slackBotTokenFor } from "@/lib/teamIntegrations";
import { parseBody, readJson } from "@/lib/validation";

// Estado de las integraciones del equipo activo. NUNCA devuelve las claves, solo si están y los últimos 4 caracteres.
export async function GET() {
  const auth = await apiUser({ workspace: true, lead: true });
  if ("error" in auth) return auth.error;
  try {
    const id = auth.user.workspaceId!;
    const ws = await prisma.workspace.findUnique({ where: { id }, select: { geminiKeyEnc: true, geminiKeyHint: true, openaiKeyEnc: true, openaiKeyHint: true, slackBotEnc: true, slackBotHint: true, slackWebhookEnc: true, slackWebhookHint: true } });
    return NextResponse.json({
      gemini: { own: !!ws?.geminiKeyEnc, hint: ws?.geminiKeyHint ?? null, active: !!(await geminiKeyFor(id)) },
      openai: { own: !!ws?.openaiKeyEnc, hint: ws?.openaiKeyHint ?? null, active: !!(await openaiKeyFor(id)) },
      slackWebhook: { own: !!ws?.slackWebhookEnc, hint: ws?.slackWebhookHint ?? null, active: !!ws?.slackWebhookEnc },
      slackBot: { own: !!ws?.slackBotEnc, hint: ws?.slackBotHint ?? null, active: !!(await slackBotTokenFor(id)) },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// Guarda o borra las claves (cadena vacía o null = borrar). Solo dueño o admin del equipo.
export async function PUT(req: Request) {
  const auth = await apiUser({ workspace: true, lead: true });
  if ("error" in auth) return auth.error;
  const parsed = parseBody(
    z.object({
      geminiKey: z.string().trim().max(200).nullable().optional(),
      openaiKey: z.string().trim().max(300).nullable().optional(),
      slackBotToken: z.string().trim().max(200).nullable().optional(),
      slackWebhook: z.string().trim().max(300).nullable().optional(),
    }),
    await readJson(req),
  );
  if ("error" in parsed) return parsed.error;
  const { geminiKey, openaiKey, slackBotToken, slackWebhook } = parsed.data;
  const data: Record<string, string | null> = {};

  if (geminiKey !== undefined) {
    if (!geminiKey) Object.assign(data, { geminiKeyEnc: null, geminiKeyHint: null });
    else {
      if (!/^[A-Za-z0-9_-]{20,}$/.test(geminiKey)) return NextResponse.json({ error: "La clave de Gemini no parece válida" }, { status: 400 });
      Object.assign(data, { geminiKeyEnc: encryptSecret(geminiKey), geminiKeyHint: geminiKey.slice(-4) });
    }
  }
  if (openaiKey !== undefined) {
    if (!openaiKey) Object.assign(data, { openaiKeyEnc: null, openaiKeyHint: null });
    else {
      if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(openaiKey)) return NextResponse.json({ error: "La clave de OpenAI no parece válida (empieza con sk-)" }, { status: 400 });
      Object.assign(data, { openaiKeyEnc: encryptSecret(openaiKey), openaiKeyHint: openaiKey.slice(-4) });
    }
  }
  if (slackBotToken !== undefined) {
    if (!slackBotToken) Object.assign(data, { slackBotEnc: null, slackBotHint: null });
    else {
      if (!SLACK_BOT_TOKEN_PATTERN.test(slackBotToken)) return NextResponse.json({ error: "El token del bot de Slack debe empezar con xoxb-" }, { status: 400 });
      Object.assign(data, { slackBotEnc: encryptSecret(slackBotToken), slackBotHint: slackBotToken.slice(-4) });
    }
  }
  if (slackWebhook !== undefined) {
    if (!slackWebhook) Object.assign(data, { slackWebhookEnc: null, slackWebhookHint: null });
    else {
      if (!SLACK_WEBHOOK_PATTERN.test(slackWebhook)) return NextResponse.json({ error: "El webhook debe ser https://hooks.slack.com/services/…" }, { status: 400 });
      Object.assign(data, { slackWebhookEnc: encryptSecret(slackWebhook), slackWebhookHint: slackWebhook.slice(-4) });
    }
  }
  try {
    await prisma.workspace.update({ where: { id: auth.user.workspaceId! }, data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
