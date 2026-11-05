import { prisma } from "@/lib/prisma";
import { membersOf } from "@/lib/workspace";
import { requireSession } from "@/lib/session";
import { getProjectOrNotFound } from "@/lib/projectData";
import { parseStringList } from "@/lib/scrum/ready";
import { slackBotTokenFor } from "@/lib/teamIntegrations";
import { sprintPdfEnabled } from "@/lib/features";
import SettingsForm from "./SettingsForm";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const project = await getProjectOrNotFound(id);
  const [statuses, users] = await Promise.all([
    prisma.statusOption.findMany({ where: { workspaceId: project.access.workspaceId }, orderBy: { order: "asc" } }),
    membersOf(project.access.workspaceId).then((m) => m.map(({ id, name }) => ({ id, name }))),
  ]);

  let stack: string[] = [];
  try {
    const parsed = JSON.parse(project.stack);
    if (Array.isArray(parsed)) stack = parsed.filter((s): s is string => typeof s === "string");
  } catch {}

  return (
    <SettingsForm
      isLead={project.access.isLead}
      statuses={statuses.map((s) => ({ id: s.id, name: s.name }))}
      users={users}
      project={{
        id: project.id,
        key: project.key ?? "",
        name: project.name,
        description: project.description,
        deployUrl: project.deployUrl ?? "",
        stack,
        statusId: project.statusId,
        leadUserId: project.leadUserId ?? "",
        readyItems: parseStringList(project.readyItems),
        webhookConfigured: !!project.discordWebhookUrl,
        slackChannelId: project.slackChannelId ?? "",
        slackBot: !!(await slackBotTokenFor(project.access.workspaceId)),
        pdfEnabled: sprintPdfEnabled(),
        slackConfigured: !!project.slackWebhookUrl,
        slackHint: project.slackWebhookUrl ? project.slackWebhookUrl.slice(-6) : null,
        telegramConfigured: !!project.telegramBotToken && !!project.telegramChatId,
        telegramChatId: project.telegramChatId ?? "",
        telegramHint: project.telegramBotToken ? project.telegramBotToken.slice(-4) : null,
        webhookHint: project.discordWebhookUrl ? project.discordWebhookUrl.slice(-6) : null,
      }}
    />
  );
}
