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
