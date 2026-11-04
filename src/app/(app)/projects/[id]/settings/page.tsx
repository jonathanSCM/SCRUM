import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getProjectOrNotFound } from "@/lib/projectData";
import SettingsForm from "./SettingsForm";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const project = await getProjectOrNotFound(id);
  const [statuses, users] = await Promise.all([
    prisma.statusOption.findMany({ orderBy: { order: "asc" } }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  let stack: string[] = [];
  try {
    const parsed = JSON.parse(project.stack);
    if (Array.isArray(parsed)) stack = parsed.filter((s): s is string => typeof s === "string");
  } catch {}

  return (
    <SettingsForm
      isLead={session.user.role === "LEAD"}
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
        webhookConfigured: !!project.discordWebhookUrl,
        webhookHint: project.discordWebhookUrl ? project.discordWebhookUrl.slice(-6) : null,
      }}
    />
  );
}
