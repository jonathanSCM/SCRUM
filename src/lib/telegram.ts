import { prisma } from "@/lib/prisma";
import type { DiscordMessage } from "@/lib/discord";

// Notificaciones por Telegram (Bot API). Mismo contrato que Discord: NUNCA
// lanzan, una notificación caída no puede romper la acción que la disparó.

export const TELEGRAM_TOKEN_PATTERN = /^\d{6,12}:[A-Za-z0-9_-]{30,50}$/;
// Id numérico del chat/grupo (los grupos son negativos) o @canal público.
export const TELEGRAM_CHAT_PATTERN = /^(-?\d{5,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/;
export const TELEGRAM_USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

const TIMEOUT_MS = 4000;

export type TelegramMessage = Omit<DiscordMessage, "mentionUserId" | "color"> & { mentionUsername?: string | null };

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Texto HTML del mensaje (Telegram limita a 4096 caracteres).
export function formatTelegramText(message: TelegramMessage): string {
  const lines: string[] = [`<b>${escapeHtml(message.title)}</b>`, escapeHtml(message.description).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")];
  for (const f of message.fields ?? []) lines.push(`${escapeHtml(f.name)}: <b>${escapeHtml(f.value)}</b>`);
  if (message.url) lines.push(`<a href="${escapeHtml(message.url).replace(/"/g, "&quot;")}">Abrir</a>`);
  if (message.mentionUsername) lines.push(`@${message.mentionUsername}`);
  const text = lines.join("\n");
  return text.length > 4000 ? `${text.slice(0, 3999)}…` : text;
}

export async function sendToTelegram(botToken: string, chatId: string, message: TelegramMessage): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: formatTelegramText(message), parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[telegram] respondió ${res.status}: ${await res.text().catch(() => "")}`);
      return false;
    }
    return true;
  } catch (err) {
    // No se loguea el error completo: la URL contiene el token del bot.
    console.error("[telegram] error enviando notificación:", err instanceof Error ? err.name : "desconocido");
    return false;
  }
}

export async function resolveTelegramMention(...userIds: Array<string | null | undefined>): Promise<string | null> {
  const ids = userIds.filter((id): id is string => !!id);
  if (ids.length === 0) return null;
  try {
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, telegramUsername: true } });
    for (const id of ids) {
      const found = users.find((u) => u.id === id);
      if (found?.telegramUsername) return found.telegramUsername;
    }
  } catch (err) {
    console.error("[telegram] no se pudo resolver la mención:", err);
  }
  return null;
}
