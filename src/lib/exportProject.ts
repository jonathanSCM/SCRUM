import "server-only";
import { prisma } from "@/lib/prisma";
import { membersOf } from "@/lib/workspace";
import { formatIssueKey } from "@/lib/scrum/issueKey";
import { parseChecklist } from "@/lib/scrum/checklist";
import { parseLabels } from "@/lib/scrum/labels";
import { parseStringList } from "@/lib/scrum/ready";
import { parseTags } from "@/lib/scrum/resources";
import { STATUS_META, type IssueStatus } from "@/lib/scrum/constants";

export type ExportScope = "tasks" | "full";
export type ExportOptions = { scope: ExportScope; comments: number; anonymize: boolean };

const INSTRUCTIONS =
  "Este archivo es una copia de un proyecto de SCRUM ProShop para darte contexto. Jerarquía: épica > historia > tarea/bug. " +
  "'key' identifica cada ticket (por ejemplo SAI-12). 'status': TODO | IN_PROGRESS | BLOCKED | IN_REVIEW | DONE. 'priority': URGENTE | ALTA | MEDIA | BAJA. " +
  "Las épicas traen sus historias y tareas anidadas; 'stories' y 'tasks' de la raíz son los tickets que no tienen épica. Si te pido tickets nuevos, respóndeme con el formato de importación (project.id, epics > stories > tasks) y NO repitas los que ya existen.";

// Reemplaza nombres de personas por "Persona N" de forma consistente.
function anonymizer(on: boolean, allNames: string[]) {
  const map = new Map<string, string>();
  // Se asigna un alias a todas las personas del equipo (en orden) para que sea estable y también sirva para limpiar textos.
  if (on) for (const n of allNames) if (!map.has(n)) map.set(n, `Persona ${map.size + 1}`);
  const who = (name: string | null | undefined): string | null => {
    if (!name) return null;
    if (!on) return name;
    if (!map.has(name)) map.set(name, `Persona ${map.size + 1}`);
    return map.get(name)!;
  };
  // Reemplaza nombres escritos dentro de textos libres (comentarios, descripciones, notas…), más largos primero.
  const names = [...map.keys()].sort((a, b) => b.length - a.length);
  const scrub = <T extends string | null | undefined>(text: T): T => {
    if (!on || !text) return text;
    let out: string = text;
    for (const n of names) out = out.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), map.get(n)!);
    return out as T;
  };
  return { who, scrub };
}

// Arma el JSON de un proyecto para pasárselo a una IA. NUNCA incluye claves, webhooks, tokens, correos ni el contenido de los archivos.
export async function buildProjectExport(projectId: string, opts: ExportOptions) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { status: { select: { name: true } }, lead: { select: { name: true } }, members: { select: { user: { select: { name: true } } } } },
  });
  if (!project) return null;
  const people = project.workspaceId ? await membersOf(project.workspaceId) : [];
  const { who, scrub } = anonymizer(opts.anonymize, people.map((p) => p.name));
  const key = project.key;

  const [tasks, sprints] = await Promise.all([
    prisma.task.findMany({
      where: { projectId },
      orderBy: { number: "asc" },
      include: {
        assignee: { select: { name: true } },
        reporter: { select: { name: true } },
        sprint: { select: { name: true } },
        involved: { select: { user: { select: { name: true } } } },
        comments: opts.comments > 0 ? { orderBy: { createdAt: "desc" }, take: opts.comments, include: { author: { select: { name: true } } } } : false,
      },
    }),
    prisma.sprint.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
  ]);

  const keyOf = (t: { number: number | null }) => formatIssueKey(key, t.number);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const toItem = (t: (typeof tasks)[number]) => ({
    key: keyOf(t),
    type: t.issueType,
    title: scrub(t.title),
    description: scrub(t.description) || undefined,
    status: t.status,
    priority: t.priority,
    storyPoints: t.storyPoints,
    assignee: who(t.assignee?.name) ?? undefined,
    reporter: who(t.reporter?.name) ?? undefined,
    involved: t.involved.length ? t.involved.map((i) => who(i.user.name)) : undefined,
    sprint: t.sprint?.name,
    labels: parseLabels(t.labels).length ? parseLabels(t.labels) : undefined,
    dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : undefined,
    createdAt: t.createdAt.toISOString().slice(0, 10),
    completedAt: t.completedAt ? t.completedAt.toISOString().slice(0, 10) : undefined,
    readyDone: parseStringList(t.readyDone).length ? parseStringList(t.readyDone) : undefined,
    checklist: parseChecklist(t.checklist).length ? parseChecklist(t.checklist).map((c) => ({ text: c.text, done: c.done, ...(c.due ? { due: c.due } : {}) })) : undefined,
    comments:
      opts.comments > 0 && "comments" in t && Array.isArray(t.comments) && t.comments.length
        ? ([...(t.comments as unknown as Array<{ body: string; createdAt: Date; author: { name: string } | null }>)]).reverse().map((c) => ({ author: who(c.author?.name), date: c.createdAt.toISOString().slice(0, 10), text: scrub(c.body.slice(0, 1000)) }))
        : undefined,
  });

  const stories = tasks.filter((t) => t.issueType === "STORY");
  const leaves = tasks.filter((t) => t.issueType === "TASK" || t.issueType === "BUG");
  const childrenOf = (storyId: string) => leaves.filter((l) => l.parentId === storyId).map(toItem);
  const storyItem = (s: (typeof tasks)[number]) => ({ ...toItem(s), tasks: childrenOf(s.id) });

  const epics = tasks
    .filter((t) => t.issueType === "EPIC")
    .map((e) => ({
      ...toItem(e),
      stories: stories.filter((s) => s.epicId === e.id).map(storyItem),
      tasks: leaves.filter((l) => l.epicId === e.id && !(l.parentId && byId.get(l.parentId)?.epicId === e.id)).map(toItem),
    }));
  const noEpic = {
    stories: stories.filter((s) => !s.epicId).map(storyItem),
    tasks: leaves.filter((l) => !l.epicId && !l.parentId).map(toItem),
  };

  const real = tasks.filter((t) => t.issueType !== "EPIC");
  const done = real.filter((t) => t.status === "DONE");
  const byStatus = Object.fromEntries((Object.keys(STATUS_META) as IssueStatus[]).map((s) => [s, real.filter((t) => t.status === s).length]));
  const points = (list: typeof real) => list.reduce((n, t) => n + (t.storyPoints ?? 0), 0);

  const base = {
    _meta: {
      format: "scrum-proshop-export",
      version: 1,
      exportedAt: new Date().toISOString(),
      scope: opts.scope,
      anonimizado: opts.anonymize,
      instrucciones: INSTRUCTIONS,
      conteo: { epicas: epics.length, historias: stories.length, tareas: leaves.length, tickets: tasks.length },
    },
    project: {
      id: project.id,
      key,
      name: project.name,
      description: project.description,
      stack: parseStringList(project.stack),
      labels: parseLabels(project.labels),
      deployUrl: project.deployUrl ?? undefined,
      status: project.status.name,
      lead: who(project.lead?.name) ?? undefined,
      members: project.members.map((m) => who(m.user.name)),
      definitionOfReady: parseStringList(project.readyItems),
    },
    resumen: { porEstado: byStatus, puntosTotales: points(real), puntosHechos: points(done) },
    epics,
    ...noEpic, // historias y tareas sin épica (mismos nombres que en la importación: "stories" y "tasks")
  };
  if (opts.scope === "tasks") return base;

  // Completo: sprints, notas, retros y archivos/enlaces (sin contenido).
  const [notes, retros, resources] = await Promise.all([
    prisma.note.findMany({ where: { projectId }, orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } }),
    prisma.retroItem.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
    prisma.projectResource.findMany({ where: { projectId }, orderBy: { createdAt: "asc" }, select: { kind: true, title: true, url: true, filename: true, tags: true, sprint: { select: { name: true } }, task: { select: { number: true } } } }),
  ]);
  const sprintName = new Map(sprints.map((s) => [s.id, s.name]));
  return {
    ...base,
    sprints: sprints.map((s) => ({
      name: s.name,
      state: s.state,
      goal: s.goal || undefined,
      startDate: s.startDate?.toISOString().slice(0, 10),
      endDate: s.endDate?.toISOString().slice(0, 10),
      committedPoints: s.committedPoints,
      completedPoints: s.completedPoints,
      tickets: real.filter((t) => t.sprintId === s.id).map(keyOf),
    })),
    notes: notes.map((n) => ({ title: n.title, kind: n.kind, date: n.createdAt.toISOString().slice(0, 10), author: who(n.author?.name) ?? undefined, body: scrub(n.body.slice(0, 20000)) })),
    retros: retros.map((r) => ({ sprint: sprintName.get(r.sprintId), column: r.column, text: scrub(r.body), ticket: r.ticketKey ?? undefined })),
    archivos: resources.map((r) => ({ type: r.kind === "LINK" ? "enlace" : "archivo", title: r.title, url: r.url ?? undefined, filename: r.filename ?? undefined, tags: parseTags(r.tags), sprint: r.sprint?.name, ticket: r.task ? formatIssueKey(key, r.task.number) : undefined })),
  };
}
