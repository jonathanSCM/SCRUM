import { prisma } from "@/lib/prisma";
import { resolveDiscordMention, sendToDiscordWebhook, type DiscordMessage } from "@/lib/discord";
import { buildPushPayload, pushConfigured, sendPush } from "@/lib/push";
import { ntfyConfigured } from "@/lib/ntfy";
import { resolveSlackMention, sendToSlackWebhook } from "@/lib/slack";
import { resolveTelegramMention, sendToTelegram } from "@/lib/telegram";

export type ProjectNotification = Omit<DiscordMessage, "mentionUserId"> & {
  // Usuarios de la app a mencionar (se usa el primero que tenga cuenta en cada canal).
  mentionUserIds?: Array<string | null | undefined>;
  // Push del navegador: a los mencionados (por defecto) o a todo el equipo.
  pushAll?: boolean;
  // Quien hizo la acción no recibe su propio aviso.
  excludeUserId?: string;
};

// Avisa por los canales que tenga configurados el proyecto (Discord, Telegram
// y/o Slack). NUNCA lanza.
export async function notifyProject(projectId: string, message: ProjectNotification): Promise<void> {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true, discordWebhookUrl: true, telegramBotToken: true, telegramChatId: true, slackWebhookUrl: true },
    });
    if (!project) return;
    const ids = message.mentionUserIds ?? [];
    const jobs: Promise<unknown>[] = [];

    if (project.discordWebhookUrl) {
      const url = project.discordWebhookUrl;
      jobs.push(resolveDiscordMention(...ids).then((mentionUserId) => sendToDiscordWebhook(url, { ...message, mentionUserId })));
    }
    if (project.telegramBotToken && project.telegramChatId) {
      const { telegramBotToken: token, telegramChatId: chat } = project;
      jobs.push(resolveTelegramMention(...ids).then((mentionUsername) => sendToTelegram(token, chat, { ...message, mentionUsername })));
    }
    if (project.slackWebhookUrl) {
      const url = project.slackWebhookUrl;
      jobs.push(resolveSlackMention(...ids).then((mentionSlackId) => sendToSlackWebhook(url, { ...message, mentionSlackId })));
    }
    if (pushConfigured() || ntfyConfigured()) {
      const targets = message.pushAll ? null : ids.filter((id): id is string => !!id && id !== message.excludeUserId);
      const payload = buildPushPayload(message, `/projects/${projectId}/board`);
      jobs.push(
        message.pushAll
          ? prisma.user.findMany({ where: { memberships: { some: { workspaceId: project.workspaceId ?? "" } }, ...(message.excludeUserId ? { id: { not: message.excludeUserId } } : {}) }, select: { id: true } }).then((users) => sendPush(users.map((u) => u.id), payload))
          : sendPush(targets, payload)
      );
    }
    await Promise.allSettled(jobs);
  } catch (err) {
    console.error("[notify] no se pudo preparar la notificación:", err);
  }
}
