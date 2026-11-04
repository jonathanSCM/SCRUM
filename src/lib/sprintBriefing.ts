import { prisma } from "@/lib/prisma";
import { getBaseUrl } from "@/lib/baseUrl";
import { logHistory } from "@/lib/history";
import { generateSprintInsights, geminiConfigured, type SprintInsights } from "@/lib/gemini";
import { renderSprintPdf } from "@/lib/sprintPdf";
import { sendToSlackWebhook, slackBotConfigured, uploadFileToSlack } from "@/lib/slack";
import { formatIssueKey } from "@/lib/scrum/issueKey";
import { PRIORITY_META, STATUS_META, ISSUE_TYPE_META, type IssueStatus, type IssueType, type Priority } from "@/lib/scrum/constants";
import { missingReadyItems, parseStringList } from "@/lib/scrum/ready";
import { summarizeTickets, type SprintReportData } from "@/lib/scrum/sprintReport";

export async function loadSprintReportData(sprintId: string): Promise<SprintReportData | null> {
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    include: { project: { select: { name: true, key: true, description: true, readyItems: true } } },
  });
  if (!sprint?.project) return null;
  const readyItems = parseStringList(sprint.project.readyItems);

  const tasks = await prisma.task.findMany({
    where: { sprintId, issueType: { not: "EPIC" } },
    include: { assignee: { select: { name: true } }, epic: { select: { number: true, title: true } } },
  });

  return {
    project: { name: sprint.project.name, key: sprint.project.key, description: sprint.project.description },
    sprint: {
      id: sprint.id,
      name: sprint.name,
      goal: sprint.goal,
      startDate: sprint.startDate?.toISOString() ?? null,
      endDate: sprint.endDate?.toISOString() ?? null,
    },
    tickets: tasks.map((t) => ({
      key: formatIssueKey(sprint.project!.key, t.number),
      type: ISSUE_TYPE_META[t.issueType as IssueType]?.label ?? t.issueType,
      title: t.title,
      description: t.description,
      priority: PRIORITY_META[t.priority as Priority]?.label ?? t.priority,
      priorityWeight: PRIORITY_META[t.priority as Priority]?.weight ?? 0,
      points: t.storyPoints,
      status: STATUS_META[t.status as IssueStatus]?.label ?? t.status,
      assignee: t.assignee?.name ?? null,
      epic: t.epic ? `${formatIssueKey(sprint.project!.key, t.epic.number)} ${t.epic.title}` : null,
      dueDate: t.dueDate?.toISOString() ?? null,
      readyMissing: missingReadyItems(readyItems, parseStringList(t.readyDone)),
    })),
  };
}

export async function buildSprintPdf(sprintId: string, options: { ai?: boolean } = {}) {
  const data = await loadSprintReportData(sprintId);
  if (!data) return null;
  const insights: SprintInsights | null = options.ai === false ? null : await generateSprintInsights(data);
  const pdf = await renderSprintPdf(data, insights);
  return { data, insights, pdf };
}

export type BriefingResult = { delivered: "file" | "link" | "none"; ai: boolean; error?: string };

// Genera el PDF del sprint (con sugerencias de Gemini si hay clave) y lo manda
// al Slack del proyecto: como archivo si hay bot + canal, o como mensaje con
// el enlace de descarga si solo hay webhook. NUNCA lanza.
export async function sendSprintBriefing(sprintId: string, actor?: { id: string; name: string } | null): Promise<BriefingResult> {
  try {
    const built = await buildSprintPdf(sprintId);
    if (!built) return { delivered: "none", ai: false, error: "Sprint no encontrado" };
    const { data, insights, pdf } = built;

    const sprint = await prisma.sprint.findUnique({
      where: { id: sprintId },
      select: { projectId: true, project: { select: { slackWebhookUrl: true, slackChannelId: true } } },
    });
    if (!sprint?.projectId || !sprint.project) return { delivered: "none", ai: !!insights };

    const s = summarizeTickets(data.tickets);
    const headline = `🚀 Arrancó *${data.sprint.name}* en ${data.project.name}: ${s.count} tickets · ${s.points} pts${insights ? "" : geminiConfigured() ? " (sin sugerencias de IA: Gemini no respondió)" : ""}`;
    const filename = `${(data.project.key ?? data.project.name).replace(/[^\w-]+/g, "_")}-${data.sprint.name.replace(/[^\w-]+/g, "_")}.pdf`;
    const link = `${getBaseUrl()}/api/sprints/${sprintId}/report`;

    let result: BriefingResult = { delivered: "none", ai: !!insights };
    const { slackChannelId, slackWebhookUrl } = sprint.project;

    if (slackBotConfigured() && slackChannelId) {
      const up = await uploadFileToSlack({ channelId: slackChannelId, filename, content: pdf, title: `${data.project.name} · ${data.sprint.name}`, comment: headline });
      if (up.ok) result = { delivered: "file", ai: !!insights };
      else console.error("[briefing] no se pudo subir el PDF a Slack:", up.error);
      if (!up.ok) result.error = up.error;
    }
    if (result.delivered === "none" && slackWebhookUrl) {
      const ok = await sendToSlackWebhook(slackWebhookUrl, {
        title: `Informe del sprint ${data.sprint.name}`,
        description: `${headline.replace(/\*/g, "")}\nEl PDF se descarga desde la app (hace falta iniciar sesión).`,
        url: link,
      });
      if (ok) result = { delivered: "link", ai: !!insights };
    }

    await logHistory({
      projectId: sprint.projectId,
      field: "sprint_briefing",
      newValue: `${data.sprint.name}: ${result.delivered === "none" ? "no enviado" : result.delivered === "file" ? "PDF enviado a Slack" : "enlace enviado a Slack"}${insights ? " (con IA)" : ""}`,
      actor,
    });
    return result;
  } catch (err) {
    console.error("[briefing] error:", err);
    return { delivered: "none", ai: false, error: "Error inesperado" };
  }
}
