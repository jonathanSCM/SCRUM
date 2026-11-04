import { prisma } from "@/lib/prisma";

// Colores de los embeds, alineados a la paleta de la app.
export const DISCORD_COLOR = {
  created: 0x8b5cf6,
  done: 0x2fe3a6,
  assigned: 0xc084fc,
  comment: 0xa996c9,
  status: 0xffb020,
  sprintStarted: 0x8b5cf6,
  sprintCompleted: 0x2fe3a6,
  test: 0xc084fc,
} as const;

export const DISCORD_WEBHOOK_PATTERN = /^https:\/\/discord(app)?\.com\/api\/webhooks\/.+/;

export type DiscordMessage = {
  title: string;
  description: string;
  color?: number;
  mentionUserId?: string | null;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  url?: string;
};

const TIMEOUT_MS = 4000;

// Manda un embed al webhook. NUNCA lanza: una notificación caída no puede
// romper la acción que la disparó. Devuelve true si Discord respondió ok.
// La mención va en "content" porque dentro de un embed no pinguea a nadie.
export async function sendToDiscordWebhook(webhookUrl: string, message: DiscordMessage): Promise<boolean> {
  const payload = {
    content: message.mentionUserId ? `<@${message.mentionUserId}>` : undefined,
    allowed_mentions: message.mentionUserId ? { users: [message.mentionUserId] } : { parse: [] },
    embeds: [
      {
        title: truncate(message.title, 256),
        description: truncate(message.description, 4000),
        color: message.color ?? DISCORD_COLOR.created,
        url: message.url,
        fields: message.fields?.slice(0, 10).map((f) => ({ name: truncate(f.name, 256), value: truncate(f.value, 1024), inline: f.inline })),
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[discord] webhook respondió ${res.status}: ${await res.text().catch(() => "")}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[discord] error enviando notificación:", err);
    return false;
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// Avisa en el canal del proyecto (si tiene webhook configurado).
export async function notifyDiscord(projectId: string, message: DiscordMessage): Promise<void> {
  try {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { discordWebhookUrl: true } });
    if (!project?.discordWebhookUrl) return;
    await sendToDiscordWebhook(project.discordWebhookUrl, message);
  } catch (err) {
    console.error("[discord] no se pudo preparar la notificación:", err);
  }
}

// Devuelve el Discord ID del primer usuario (en el orden dado) que lo tenga
// configurado, para mencionarlo en el mensaje.
export async function resolveDiscordMention(...userIds: Array<string | null | undefined>): Promise<string | null> {
  const ids = userIds.filter((id): id is string => !!id);
  if (ids.length === 0) return null;
  try {
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, discordUserId: true } });
    for (const id of ids) {
      const found = users.find((u) => u.id === id);
      if (found?.discordUserId) return found.discordUserId;
    }
  } catch (err) {
    console.error("[discord] no se pudo resolver la mención:", err);
  }
  return null;
}
