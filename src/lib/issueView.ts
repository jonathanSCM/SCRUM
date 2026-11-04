import "server-only";
import type { IssueWithRefs } from "@/lib/issues";
import type { Sprint } from "@prisma/client";
import { formatIssueKey } from "@/lib/scrum/issueKey";
import { parseStringList } from "@/lib/scrum/ready";
import { checklistProgress, parseChecklist } from "@/lib/scrum/checklist";
import { parseLabels } from "@/lib/scrum/labels";
import type { IssueStatus, IssueType, Priority, SprintState } from "@/lib/scrum/constants";
import type { IssueCardData, SprintData } from "@/lib/types";

// Convierte filas de Prisma en los objetos planos (fechas como texto) que los
// componentes de cliente reciben por props.

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toIssueCard(task: IssueWithRefs, projectKey: string | null): IssueCardData {
  return {
    id: task.id,
    key: formatIssueKey(projectKey, task.number),
    number: task.number,
    projectId: task.projectId,
    title: task.title,
    description: task.description,
    issueType: task.issueType as IssueType,
    status: task.status as IssueStatus,
    priority: task.priority as Priority,
    storyPoints: task.storyPoints,
    labels: parseLabels(task.labels),
    readyDone: parseStringList(task.readyDone),
    checklist: checklistProgress(parseChecklist(task.checklist)),
    parent: task.parent ? { id: task.parent.id, key: formatIssueKey(projectKey, task.parent.number), title: task.parent.title } : null,
    rank: task.rank,
    dueDate: iso(task.dueDate),
    createdAt: task.createdAt.toISOString(),
    completedAt: iso(task.completedAt),
    sprintId: task.sprintId,
    assignee: task.assignee,
    epic: task.epic ? { id: task.epic.id, key: formatIssueKey(projectKey, task.epic.number), title: task.epic.title, color: task.epic.epicColor } : null,
    epicColor: task.epicColor,
    commentCount: task._count.comments,
    attachmentCount: task._count.attachments,
  };
}

export function toSprintData(s: Sprint): SprintData {
  return {
    id: s.id,
    name: s.name,
    goal: s.goal,
    state: s.state as SprintState,
    startDate: iso(s.startDate),
    endDate: iso(s.endDate),
    startedAt: iso(s.startedAt),
    completedAt: iso(s.completedAt),
    committedPoints: s.committedPoints,
    completedPoints: s.completedPoints,
    committedCount: s.committedCount,
    completedCount: s.completedCount,
  };
}
