import { prisma } from "@/lib/prisma";
import { resolveDiscordMention, sendToDiscordWebhook, type DiscordMessage } from "@/lib/discord";
import { resolveSlackMention, sendToSlackWebhook } from "@/lib/slack";
import { resolveTelegramMention, sendToTelegram } from "@/lib/telegram";

export type ProjectNotification = Omit<DiscordMessage, "mentionUserId"> & {
  // Usuarios de la app a mencionar (se usa el primero que tenga cuenta en cada canal).
  mentionUserIds?: Array<string | null | undefined>;
};

// Avisa por los canales que tenga configurados el proyecto (Discord, Telegram
// y/o Slack). NUNCA lanza.
export async function notifyProject(projectId: string, message: ProjectNotification): Promise<void> {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { discordWebhookUrl: true, telegramBotToken: true, telegramChatId: true, slackWebhookUrl: true },
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
    await Promise.allSettled(jobs);
  } catch (err) {
    console.error("[notify] no se pudo preparar la notificación:", err);
  }
}
