import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logHistory } from "@/lib/history";
import { DISCORD_COLOR } from "@/lib/discord";
import { notifyProject } from "@/lib/notify";
import { getBaseUrl } from "@/lib/baseUrl";
import { formatIssueKey, parseIssueKey } from "@/lib/scrum/issueKey";
import { parseStringList } from "@/lib/scrum/ready";
import { parseLabels } from "@/lib/scrum/labels";
import { validateLeaveActiveSprint } from "@/lib/scrum/sprintLifecycle";
import { needsRebalance, rankBetween, rebalance, RANK_STEP } from "@/lib/scrum/rank";
import {
  ISSUE_TYPE_META,
  PRIORITY_META,
  STATUS_META,
  type IssueStatus,
  type IssueType,
  type Priority,
} from "@/lib/scrum/constants";

// Lógica de tickets compartida por la API (crear, editar, mover, borrar). Las
// rutas solo validan la entrada y llaman acá; así el historial, el estado
// "hecho" y las notificaciones se comportan igual venga de donde venga el cambio.

export const issueInclude = {
  assignee: { select: { id: true, name: true } },
  reporter: { select: { id: true, name: true } },
  epic: { select: { id: true, number: true, title: true, epicColor: true } },
  _count: { select: { comments: true, attachments: true } },
} satisfies Prisma.TaskInclude;

export type IssueWithRefs = Prisma.TaskGetPayload<{ include: typeof issueInclude }>;

export type Actor = { id: string; name: string; role?: "LEAD" | "MEMBER" };

export type IssuePatch = {
  title?: string;
  description?: string;
  issueType?: IssueType;
  status?: IssueStatus;
  priority?: Priority;
  storyPoints?: number | null;
  labels?: string[];
  readyDone?: string[];
  assigneeUserId?: string | null;
  sprintId?: string | null;
  epicId?: string | null;
  epicColor?: string | null;
  dueDate?: string | null;
  rank?: number;
};

export class IssueError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const EPIC_COLORS = ["#8b5cf6", "#14b88a", "#3b82f6", "#f59e0b", "#ef4444", "#a78bfa"];

async function validateRefs(
  projectId: string,
  refs: { sprintId?: string | null; epicId?: string | null; assigneeUserId?: string | null; issueType?: IssueType },
  selfId?: string
) {
  if (refs.sprintId) {
    if (refs.issueType === "EPIC") throw new IssueError("Las épicas no van dentro de un sprint");
    const sprint = await prisma.sprint.findUnique({ where: { id: refs.sprintId }, select: { projectId: true, state: true } });
    if (!sprint || sprint.projectId !== projectId) throw new IssueError("Ese sprint no pertenece al proyecto");
    if (sprint.state === "COMPLETED") throw new IssueError("No se pueden agregar tickets a un sprint completado");
  }
  if (refs.epicId) {
    if (refs.issueType === "EPIC") throw new IssueError("Una épica no puede pertenecer a otra épica");
    if (refs.epicId === selfId) throw new IssueError("Un ticket no puede ser su propia épica");
    const epic = await prisma.task.findUnique({ where: { id: refs.epicId }, select: { projectId: true, issueType: true } });
    if (!epic || epic.projectId !== projectId || epic.issueType !== "EPIC") throw new IssueError("Esa épica no existe en el proyecto");
  }
  if (refs.assigneeUserId) {
    const user = await prisma.user.findUnique({ where: { id: refs.assigneeUserId }, select: { id: true } });
    if (!user) throw new IssueError("Ese usuario no existe");
  }
}

function issueUrl(projectId: string, key: string) {
  return `${getBaseUrl()}/projects/${projectId}/board?issue=${key}`;
}

// ---- Crear ----

export type CreateIssueInput = IssuePatch & { title: string };

export async function createIssue(projectId: string, input: CreateIssueInput, actor: Actor): Promise<IssueWithRefs> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, key: true, name: true, leadUserId: true } });
  if (!project || !project.key) throw new IssueError("Proyecto no encontrado", 404);

  const issueType = input.issueType ?? "TASK";
  const sprintId = issueType === "EPIC" ? null : input.sprintId ?? null;
  const epicId = issueType === "EPIC" ? null : input.epicId ?? null;
  await validateRefs(projectId, { sprintId, epicId, assigneeUserId: input.assigneeUserId, issueType });

  const status = issueType === "EPIC" ? "TODO" : input.status ?? "TODO";
  const now = new Date();

  const created = await prisma.$transaction(async (tx) => {
    const bumped = await tx.project.update({ where: { id: projectId }, data: { taskSeq: { increment: 1 } }, select: { taskSeq: true } });
    const top = await tx.task.aggregate({ where: { projectId, sprintId }, _max: { rank: true } });
    const epicCount = issueType === "EPIC" ? await tx.task.count({ where: { projectId, issueType: "EPIC" } }) : 0;

    return tx.task.create({
      data: {
        projectId,
        number: bumped.taskSeq,
        title: input.title,
        description: input.description ?? "",
        issueType,
        status,
        priority: input.priority ?? "MEDIA",
        storyPoints: input.storyPoints ?? null,
        labels: JSON.stringify(input.labels ?? []),
        readyDone: JSON.stringify(input.readyDone ?? []),
        rank: (top._max.rank ?? 0) + RANK_STEP,
        epicColor: issueType === "EPIC" ? input.epicColor ?? EPIC_COLORS[epicCount % EPIC_COLORS.length] : null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        assigneeUserId: input.assigneeUserId ?? null,
        reporterId: actor.id,
        epicId,
        sprintId,
        sprintAddedAt: sprintId ? now : null,
        completedAt: status === "DONE" ? now : null,
      },
      include: issueInclude,
    });
  });

  const key = formatIssueKey(project.key, created.number);
  await logHistory({ projectId, taskId: created.id, taskTitle: created.title, field: "ticket_creado", newValue: key, actor });

  await notifyProject(projectId, {
    title: `${key} creado en ${project.name}`,
    description: `**${actor.name}** creó ${ISSUE_TYPE_META[issueType as IssueType].label.toLowerCase()} «${created.title}»${
      created.assignee ? ` — asignado a ${created.assignee.name}` : ""
    }`,
    color: DISCORD_COLOR.created,
    mentionUserIds: [created.assigneeUserId],
    url: issueUrl(projectId, key),
  });

  return created;
}

// ---- Editar ----

export async function updateIssue(
  issueId: string,
  patch: IssuePatch,
  actor: Actor,
  options: { silent?: boolean } = {}
): Promise<IssueWithRefs> {
  const current = await prisma.task.findUnique({
    where: { id: issueId },
    include: { ...issueInclude, project: { select: { id: true, key: true, name: true, leadUserId: true } }, sprint: { select: { name: true, state: true } } },
  });
  if (!current) throw new IssueError("Ticket no encontrado", 404);
  const { project } = current;

  const issueType = (patch.issueType ?? current.issueType) as IssueType;
  const wasEpic = current.issueType === "EPIC";
  const data: Prisma.TaskUncheckedUpdateInput = {};
  const changes: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
  const track = (field: string, oldValue: string | null, newValue: string | null) => {
    if (oldValue !== newValue) changes.push({ field, oldValue, newValue });
  };

  if (patch.title !== undefined && patch.title !== current.title) {
    data.title = patch.title;
    track("titulo_ticket", current.title, patch.title);
  }
  if (patch.description !== undefined && patch.description !== current.description) {
    data.description = patch.description;
    track("descripcion_ticket", null, "editada");
  }

  if (patch.issueType !== undefined && patch.issueType !== current.issueType) {
    data.issueType = patch.issueType;
    track("tipo_ticket", ISSUE_TYPE_META[current.issueType as IssueType]?.label ?? current.issueType, ISSUE_TYPE_META[patch.issueType].label);
    if (patch.issueType === "EPIC") {
      data.sprintId = null;
      data.epicId = null;
      data.sprintAddedAt = null;
      data.epicColor = current.epicColor ?? EPIC_COLORS[0];
    }
  }

  // Referencias (sprint / épica / encargado)
  const nextSprintId = issueType === "EPIC" ? null : patch.sprintId !== undefined ? patch.sprintId : current.sprintId;
  const nextEpicId = issueType === "EPIC" ? null : patch.epicId !== undefined ? patch.epicId : current.epicId;
  await validateRefs(
    project.id,
    {
      sprintId: patch.sprintId !== undefined && patch.sprintId !== current.sprintId ? nextSprintId : undefined,
      epicId: patch.epicId !== undefined && patch.epicId !== current.epicId ? nextEpicId : undefined,
      assigneeUserId: patch.assigneeUserId,
      issueType,
    },
    current.id
  );

  if (issueType !== "EPIC") {
    const blocked = validateLeaveActiveSprint({
      currentSprintState: current.sprint?.state ?? null,
      currentSprintId: current.sprintId,
      nextSprintId,
      actorRole: actor.role,
    });
    if (blocked) throw new IssueError(blocked, 403);
  }
  if (nextSprintId !== current.sprintId && issueType !== "EPIC") {
    data.sprintId = nextSprintId;
    data.sprintAddedAt = nextSprintId ? new Date() : null;
    const target = nextSprintId ? await prisma.sprint.findUnique({ where: { id: nextSprintId }, select: { name: true } }) : null;
    track("sprint_ticket", current.sprint?.name ?? "Backlog", target?.name ?? "Backlog");
  }
  if (nextEpicId !== current.epicId && issueType !== "EPIC") {
    data.epicId = nextEpicId;
    const target = nextEpicId ? await prisma.task.findUnique({ where: { id: nextEpicId }, select: { number: true, title: true } }) : null;
    track(
      "epica_ticket",
      current.epic ? `${formatIssueKey(project.key, current.epic.number)} ${current.epic.title}` : null,
      target ? `${formatIssueKey(project.key, target.number)} ${target.title}` : null
    );
  }
  if (patch.epicColor !== undefined && issueType === "EPIC") data.epicColor = patch.epicColor;

  let assigneeChanged = false;
  let newAssignee: { id: string; name: string } | null = current.assignee;
  if (patch.assigneeUserId !== undefined && patch.assigneeUserId !== current.assigneeUserId) {
    data.assigneeUserId = patch.assigneeUserId;
    newAssignee = patch.assigneeUserId ? await prisma.user.findUnique({ where: { id: patch.assigneeUserId }, select: { id: true, name: true } }) : null;
    track("encargado_ticket", current.assignee?.name ?? null, newAssignee?.name ?? "Sin asignar");
    assigneeChanged = true;
  }

  let becameDone = false;
  if (patch.status !== undefined && issueType !== "EPIC" && patch.status !== current.status) {
    data.status = patch.status;
    track("estado_ticket", STATUS_META[current.status as IssueStatus]?.label ?? current.status, STATUS_META[patch.status].label);
    if (patch.status === "DONE") {
      data.completedAt = new Date();
      becameDone = true;
    } else if (current.status === "DONE") {
      data.completedAt = null;
    }
  }

  if (patch.priority !== undefined && patch.priority !== current.priority) {
    data.priority = patch.priority;
    track("prioridad_ticket", PRIORITY_META[current.priority as Priority]?.label ?? current.priority, PRIORITY_META[patch.priority].label);
  }
  if (patch.storyPoints !== undefined && patch.storyPoints !== current.storyPoints) {
    data.storyPoints = patch.storyPoints;
    track("puntos_ticket", current.storyPoints == null ? null : String(current.storyPoints), patch.storyPoints == null ? null : String(patch.storyPoints));
  }
  if (patch.labels !== undefined) {
    const before = parseLabels(current.labels).join(", ");
    const after = patch.labels.join(", ");
    if (before !== after) {
      data.labels = JSON.stringify(patch.labels);
      track("etiquetas_ticket", before || null, after || null);
    }
  }
  if (patch.readyDone !== undefined) {
    const before = parseStringList(current.readyDone).join("|");
    if (before !== patch.readyDone.join("|")) {
      data.readyDone = JSON.stringify(patch.readyDone);
      track("listo_ticket", `${parseStringList(current.readyDone).length}`, `${patch.readyDone.length}`);
    }
  }
  if (patch.dueDate !== undefined) {
    const before = current.dueDate ? current.dueDate.toISOString().slice(0, 10) : null;
    const nextDate = patch.dueDate ? new Date(patch.dueDate) : null;
    const after = nextDate ? nextDate.toISOString().slice(0, 10) : null;
    if (before !== after) {
      data.dueDate = nextDate;
      track("fecha_limite_ticket", before, after);
    }
  }
  if (patch.rank !== undefined && patch.rank !== current.rank) data.rank = patch.rank;

  if (Object.keys(data).length === 0) return current;

  const updated = await prisma.$transaction(async (tx) => {
    // Si una épica pasa a ser otro tipo, sus hijos quedan sin épica.
    if (wasEpic && issueType !== "EPIC") await tx.task.updateMany({ where: { epicId: current.id }, data: { epicId: null } });
    return tx.task.update({ where: { id: issueId }, data, include: issueInclude });
  });

  const key = formatIssueKey(project.key, updated.number);
  for (const change of changes) {
    await logHistory({ projectId: project.id, taskId: updated.id, taskTitle: updated.title, ...change, actor });
  }

  if (!options.silent) {
    if (becameDone) {
      await notifyProject(project.id, {
        title: `${key} completado en ${project.name}`,
        description: `**${actor.name}** completó «${updated.title}»`,
        color: DISCORD_COLOR.done,
        mentionUserIds: [updated.assigneeUserId, project.leadUserId],
        url: issueUrl(project.id, key),
      });
    }
    if (assigneeChanged && newAssignee && newAssignee.id !== actor.id) {
      await notifyProject(project.id, {
        title: `${key} asignado en ${project.name}`,
        description: `**${actor.name}** asignó «${updated.title}» a ${newAssignee.name}`,
        color: DISCORD_COLOR.assigned,
        mentionUserIds: [newAssignee.id],
        url: issueUrl(project.id, key),
      });
    }
  }

  return updated;
}

// ---- Mover (drag & drop) ----

export type MoveInput = {
  issueId: string;
  sprintId?: string | null;
  status?: IssueStatus;
  prevId?: string | null;
  nextId?: string | null;
};

async function rankOf(id: string | null | undefined): Promise<number | null> {
  if (!id) return null;
  const row = await prisma.task.findUnique({ where: { id }, select: { rank: true } });
  return row ? row.rank : null;
}

// Mueve un ticket (a otro sprint, otra columna del tablero y/o otra posición)
// y calcula su rank entre los dos vecinos que dejó el usuario.
export async function moveIssue(projectId: string, input: MoveInput, actor: Actor): Promise<IssueWithRefs> {
  const issue = await prisma.task.findUnique({ where: { id: input.issueId }, select: { id: true, projectId: true, sprintId: true } });
  if (!issue || issue.projectId !== projectId) throw new IssueError("Ticket no encontrado", 404);

  const targetSprintId = input.sprintId !== undefined ? input.sprintId : issue.sprintId;

  let prev = await rankOf(input.prevId);
  let next = await rankOf(input.nextId);
  if (needsRebalance(prev, next)) {
    const siblings = await prisma.task.findMany({
      where: { projectId, sprintId: targetSprintId, issueType: { not: "EPIC" } },
      orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    await prisma.$transaction(rebalance(siblings.map((s) => s.id)).map((r) => prisma.task.update({ where: { id: r.id }, data: { rank: r.rank } })));
    prev = await rankOf(input.prevId);
    next = await rankOf(input.nextId);
  }
  const rank = rankBetween(prev, next);

  return updateIssue(input.issueId, { sprintId: input.sprintId, status: input.status, rank }, actor);
}

// ---- Cambios en lote ----

export async function bulkUpdateIssues(
  projectId: string,
  ids: string[],
  patch: Pick<IssuePatch, "sprintId" | "priority" | "assigneeUserId" | "status" | "epicId">,
  actor: Actor
): Promise<number> {
  const found = await prisma.task.findMany({ where: { id: { in: ids }, projectId }, select: { id: true } });
  let count = 0;
  for (const row of found) {
    await updateIssue(row.id, patch, actor, { silent: true });
    count++;
  }
  return count;
}

// ---- Borrar ----

export async function deleteIssue(issueId: string, actor: Actor): Promise<void> {
  const issue = await prisma.task.findUnique({ where: { id: issueId }, include: { project: { select: { id: true, key: true } } } });
  if (!issue) throw new IssueError("Ticket no encontrado", 404);
  await prisma.task.delete({ where: { id: issueId } });
  await logHistory({
    projectId: issue.project.id,
    taskTitle: issue.title,
    field: "ticket_eliminado",
    oldValue: formatIssueKey(issue.project.key, issue.number),
    actor,
  });
}

// ---- Buscar por clave ----

export async function findIssueByKey(key: string) {
  const parsed = parseIssueKey(key);
  if (!parsed) return null;
  const project = await prisma.project.findUnique({ where: { key: parsed.projectKey }, select: { id: true } });
  if (!project) return null;
  return prisma.task.findUnique({ where: { projectId_number: { projectId: project.id, number: parsed.number } }, include: issueInclude });
}
