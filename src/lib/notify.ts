import { prisma } from "@/lib/prisma";
import { DISCORD_COLOR, resolveDiscordMention, sendToDiscordWebhook, type DiscordMessage } from "@/lib/discord";
import { buildPushPayload } from "@/lib/push";
import { resolveSlackMention, sendToSlackWebhook } from "@/lib/slack";
import { resolveTelegramMention, sendToTelegram } from "@/lib/telegram";
import { notifyUsers } from "@/lib/notifications";
import type { NoticeKind } from "@/lib/scrum/notifPolicy";

export type ProjectNotification = Omit<DiscordMessage, "mentionUserId"> & {
  // Usuarios de la app a mencionar (se usa el primero que tenga cuenta en cada canal) y a avisar en su bandeja.
  mentionUserIds?: Array<string | null | undefined>;
  // Avisar a todo el equipo (inicio y cierre de sprint).
  pushAll?: boolean;
  // Quien hizo la acción no recibe su propio aviso.
  excludeUserId?: string;
  // Tipo de aviso (define si llega al instante o en un resumen) y clave para juntar los repetidos.
  kind?: NoticeKind;
  groupKey?: string;
};

type Channels = { discordWebhookUrl: string | null; telegramBotToken: string | null; telegramChatId: string | null; slackWebhookUrl: string | null };

const hasChannels = (c: Channels) => !!c.discordWebhookUrl || (!!c.telegramBotToken && !!c.telegramChatId) || !!c.slackWebhookUrl;

// Manda un mensaje a los canales externos del proyecto (Discord, Telegram y/o Slack). NUNCA lanza.
async function sendToChannels(c: Channels, message: DiscordMessage & { mentionUserIds?: Array<string | null | undefined> }): Promise<void> {
  const ids = message.mentionUserIds ?? [];
  const jobs: Promise<unknown>[] = [];
  if (c.discordWebhookUrl) {
    const url = c.discordWebhookUrl;
    jobs.push(resolveDiscordMention(...ids).then((mentionUserId) => sendToDiscordWebhook(url, { ...message, mentionUserId })));
  }
  if (c.telegramBotToken && c.telegramChatId) {
    const { telegramBotToken: token, telegramChatId: chat } = c;
    jobs.push(resolveTelegramMention(...ids).then((mentionUsername) => sendToTelegram(token, chat, { ...message, mentionUsername })));
  }
  if (c.slackWebhookUrl) {
    const url = c.slackWebhookUrl;
    jobs.push(resolveSlackMention(...ids).then((mentionSlackId) => sendToSlackWebhook(url, { ...message, mentionSlackId })));
  }
  await Promise.allSettled(jobs);
}

const IMMEDIATE_FEED: NoticeKind[] = ["SPRINT_START", "SPRINT_COMPLETE"];

// Avisa por la bandeja y el teléfono de las personas, y por los canales externos del proyecto. Los canales externos
// reciben un resumen cada X minutos (Project.feedDigestMinutes), salvo inicio y cierre de sprint. NUNCA lanza.
export async function notifyProject(projectId: string, message: ProjectNotification): Promise<void> {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true, feedDigestMinutes: true, discordWebhookUrl: true, telegramBotToken: true, telegramChatId: true, slackWebhookUrl: true },
    });
    if (!project) return;
    const kind: NoticeKind = message.kind ?? "PROJECT_UPDATE";

    // 1) Canales externos
    if (hasChannels(project)) {
      if (project.feedDigestMinutes <= 0 || IMMEDIATE_FEED.includes(kind)) await sendToChannels(project, message);
      else await prisma.projectFeedItem.create({ data: { projectId, kind, title: message.title.slice(0, 200), description: message.description.slice(0, 600), url: message.url ?? null } });
    }

    // 2) Personas
    const recipients = message.pushAll
      ? (await prisma.user.findMany({ where: { memberships: { some: { workspaceId: project.workspaceId ?? "" } } }, select: { id: true } })).map((u) => u.id)
      : (message.mentionUserIds ?? []).filter((id): id is string => !!id);
    const targets = recipients.filter((id) => id !== message.excludeUserId);
    if (targets.length) {
      const p = buildPushPayload(message, `/projects/${projectId}/board`);
      await notifyUsers(targets, { kind, title: p.title, body: p.body, url: p.url, groupKey: message.groupKey, workspaceId: project.workspaceId });
    }
  } catch (err) {
    console.error("[notify] no se pudo preparar la notificación:", err);
  }
}

// Envía a Discord / Telegram / Slack los avisos de proyecto que ya cumplieron su ventana, en un solo mensaje por proyecto.
export async function flushProjectFeeds(now: Date = new Date()): Promise<{ projects: number; items: number }> {
  let projects = 0;
  let items = 0;
  try {
    const pending = await prisma.projectFeedItem.findMany({ where: { sentAt: null }, orderBy: { createdAt: "asc" }, take: 2000 });
    const byProject = new Map<string, typeof pending>();
    for (const it of pending) byProject.set(it.projectId, [...(byProject.get(it.projectId) ?? []), it]);
    for (const [projectId, rows] of byProject) {
      const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true, feedDigestMinutes: true, discordWebhookUrl: true, telegramBotToken: true, telegramChatId: true, slackWebhookUrl: true } });
      if (!project) continue;
      const due = project.feedDigestMinutes <= 0 || rows[0].createdAt.getTime() + project.feedDigestMinutes * 60_000 <= now.getTime();
      if (!due) continue;
      const claimed = await prisma.projectFeedItem.updateMany({ where: { id: { in: rows.map((r) => r.id) }, sentAt: null }, data: { sentAt: now } });
      if (claimed.count === 0) continue;
      const lines = rows.slice(0, 15).map((r) => `• ${r.title.replace(/ en .*$/, "")}${r.description ? ` — ${r.description.replace(/\*\*/g, "")}` : ""}`);
      const extra = rows.length > 15 ? `\ny ${rows.length - 15} más` : "";
      await sendToChannels(project, { title: `Resumen de ${project.name} (${rows.length} ${rows.length === 1 ? "novedad" : "novedades"})`, description: lines.join("\n") + extra, color: DISCORD_COLOR.comment });
      projects++;
      items += claimed.count;
    }
  } catch (err) {
    console.error("[notify] error al enviar el resumen del proyecto:", err);
  }
  return { projects, items };
}
