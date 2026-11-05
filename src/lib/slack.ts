import { prisma } from "@/lib/prisma";
import type { DiscordMessage } from "@/lib/discord";

// Notificaciones por Slack (Incoming Webhook). NUNCA lanzan.

export const SLACK_WEBHOOK_PATTERN = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/;
export const SLACK_USER_ID_PATTERN = /^[UW][A-Z0-9]{8,12}$/;

const TIMEOUT_MS = 4000;

export type SlackMessage = Omit<DiscordMessage, "mentionUserId" | "color"> & { mentionSlackId?: string | null };

function escapeSlack(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatSlackText(message: SlackMessage): string {
  const lines = [`*${escapeSlack(message.title)}*`, escapeSlack(message.description).replace(/\*\*(.+?)\*\*/g, "*$1*")];
  for (const f of message.fields ?? []) lines.push(`${escapeSlack(f.name)}: *${escapeSlack(f.value)}*`);
  if (message.url) lines.push(`<${message.url}|Abrir>`);
  if (message.mentionSlackId) lines.push(`<@${message.mentionSlackId}>`);
  const text = lines.join("\n");
  return text.length > 3500 ? `${text.slice(0, 3499)}…` : text;
}

export async function sendToSlackWebhook(webhookUrl: string, message: SlackMessage): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: formatSlackText(message), unfurl_links: false }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[slack] webhook respondió ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[slack] error enviando notificación:", err instanceof Error ? err.name : "desconocido");
    return false;
  }
}

export async function resolveSlackMention(...userIds: Array<string | null | undefined>): Promise<string | null> {
  const ids = userIds.filter((id): id is string => !!id);
  if (ids.length === 0) return null;
  try {
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, slackUserId: true } });
    for (const id of ids) {
      const found = users.find((u) => u.id === id);
      if (found?.slackUserId) return found.slackUserId;
    }
  } catch (err) {
    console.error("[slack] no se pudo resolver la mención:", err);
  }
  return null;
}

// ---- Subir un archivo (PDF) al canal ----
// Un Incoming Webhook no puede subir archivos: hace falta un bot con permisos
// files:write (+ chat:write) agregado al canal. Token del bot guardado por equipo.
export const SLACK_CHANNEL_ID_PATTERN = /^[CG][A-Z0-9]{8,12}$/;

export const SLACK_BOT_TOKEN_PATTERN = /^xoxb-[A-Za-z0-9-]{20,}$/;

export async function uploadFileToSlack(opts: { token: string | null; channelId: string; filename: string; content: Buffer; title: string; comment?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = opts.token;
  if (!token) return { ok: false, error: "Falta el token del bot de Slack del equipo" };
  const auth = { Authorization: `Bearer ${token}` };
  try {
    const step1 = await fetch("https://slack.com/api/files.getUploadURLExternal", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ filename: opts.filename, length: String(opts.content.length) }),
      signal: AbortSignal.timeout(15000),
    });
    const s1 = (await step1.json()) as { ok: boolean; upload_url?: string; file_id?: string; error?: string };
    if (!s1.ok || !s1.upload_url || !s1.file_id) return { ok: false, error: s1.error ?? "getUploadURLExternal falló" };

    const step2 = await fetch(s1.upload_url, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Uint8Array(opts.content),
      signal: AbortSignal.timeout(30000),
    });
    if (!step2.ok) return { ok: false, error: `La subida respondió ${step2.status}` };

    const step3 = await fetch("https://slack.com/api/files.completeUploadExternal", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ files: [{ id: s1.file_id, title: opts.title }], channel_id: opts.channelId, initial_comment: opts.comment }),
      signal: AbortSignal.timeout(15000),
    });
    const s3 = (await step3.json()) as { ok: boolean; error?: string };
    return s3.ok ? { ok: true } : { ok: false, error: s3.error ?? "completeUploadExternal falló" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.name : "desconocido" };
  }
}
