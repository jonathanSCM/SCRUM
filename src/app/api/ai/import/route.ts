import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { parseBody, readJson } from "@/lib/validation";
import { createIssue, IssueError, type CreateIssueInput } from "@/lib/issues";
import { logHistory } from "@/lib/history";
import { notifyProject } from "@/lib/notify";
import { formatIssueKey } from "@/lib/scrum/issueKey";
import { suggestProjectKey, isValidProjectKey, normalizeProjectKey } from "@/lib/scrum/issueKey";
import { MAX_IMPORT_ISSUES, countIssues, importSchema, issueKeyOf, matchMember } from "@/lib/scrum/aiImport";

export const maxDuration = 120;

// Importa un proyecto completo (épicas > historias > tareas, notas) en una sola llamada.
// Es idempotente: lo que ya existe con el mismo tipo y título no se vuelve a crear.
// Todo queda a nombre de la persona dueña del token, sin ninguna marca adicional.
export async function POST(req: Request) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const parsed = parseBody(importSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;
  const input = parsed.data;
  const total = countIssues(input);
  if (total > MAX_IMPORT_ISSUES) {
    return NextResponse.json({ error: `Son ${total} tickets: el máximo por importación es ${MAX_IMPORT_ISSUES}. Dividilo en varias llamadas.` }, { status: 400 });
  }

  try {
    const warnings: string[] = [];

    // ---- Proyecto: existente (por id) o nuevo / ya existente por nombre ----
    let project = input.project.id ? await prisma.project.findUnique({ where: { id: input.project.id } }) : null;
    if (input.project.id && !project) return NextResponse.json({ error: "Ese project.id no existe" }, { status: 404 });
    let projectCreated = false;
    if (!project) {
      const name = input.project.name!;
      const all = await prisma.project.findMany({ select: { id: true, name: true, key: true } });
      const sameName = all.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (sameName) {
        project = await prisma.project.findUnique({ where: { id: sameName.id } });
      } else {
        const taken = all.map((p) => p.key).filter((k): k is string => !!k);
        let key = input.project.key ? normalizeProjectKey(input.project.key) : "";
        if (key && (!isValidProjectKey(key) || taken.includes(key))) {
          warnings.push(`La clave "${input.project.key}" no es válida o ya está en uso: se eligió otra.`);
          key = "";
        }
        const firstStatus = await prisma.statusOption.findFirst({ orderBy: { order: "asc" } });
        if (!firstStatus) return NextResponse.json({ error: "No hay estados de proyecto configurados" }, { status: 400 });
        project = await prisma.project.create({
          data: { name, key: key || suggestProjectKey(name, taken), description: input.project.description ?? "", statusId: firstStatus.id, leadUserId: user.id },
        });
        projectCreated = true;
        await logHistory({ projectId: project.id, field: "proyecto_creado", newValue: project.name, actor: user });
      }
    }
    if (!project) return NextResponse.json({ error: "No se pudo resolver el proyecto" }, { status: 400 });
    const projectId = project.id;

    // Datos del proyecto existente que se pidió actualizar.
    const patch: Record<string, unknown> = {};
    if (!projectCreated) {
      if (input.project.description !== undefined) patch.description = input.project.description;
      if (input.project.deployUrl !== undefined) patch.deployUrl = input.project.deployUrl || null;
    }
    if (input.project.deployUrl !== undefined && projectCreated) patch.deployUrl = input.project.deployUrl || null;
    if (input.project.stack !== undefined) patch.stack = JSON.stringify(input.project.stack);
    if (input.project.readyItems !== undefined) {
      if (user.role === "LEAD") patch.readyItems = JSON.stringify([...new Set(input.project.readyItems)]);
      else warnings.push("Solo un líder puede cambiar la Definition of Ready: se ignoró readyItems.");
    }
    if (Object.keys(patch).length) await prisma.project.update({ where: { id: projectId }, data: patch });

    // ---- Tickets ----
    const members = await prisma.user.findMany({ select: { id: true, name: true, email: true } });
    const existing = new Map((await prisma.task.findMany({ where: { projectId }, select: { id: true, issueType: true, title: true } })).map((t) => [issueKeyOf(t.issueType, t.title), t.id]));
    const created = { epics: [] as string[], stories: [] as string[], tasks: [] as string[] };
    const skipped: string[] = [];

    type Common = { title: string; description?: string; priority?: "URGENTE" | "ALTA" | "MEDIA" | "BAJA"; storyPoints?: number | null; assignee?: string; labels?: string[]; checklist?: string[]; dueDate?: string };
    async function ensure(type: "EPIC" | "STORY" | "TASK" | "BUG", c: Common, extra: Partial<CreateIssueInput> = {}): Promise<string> {
      const k = issueKeyOf(type, c.title);
      const found = existing.get(k);
      if (found) {
        skipped.push(`${type} «${c.title}»`);
        return found;
      }
      let assigneeUserId: string | null | undefined;
      if (c.assignee) {
        const m = matchMember(members, c.assignee);
        if (m) assigneeUserId = m.id;
        else warnings.push(`No encontré a "${c.assignee}" en el equipo: «${c.title}» quedó sin responsable.`);
      }
      const issue = await createIssue(
        projectId,
        {
          title: c.title,
          description: c.description,
          issueType: type,
          priority: c.priority,
          storyPoints: c.storyPoints,
          labels: c.labels,
          dueDate: c.dueDate,
          assigneeUserId,
          checklist: c.checklist?.map((text, i) => ({ id: `i${i}${Math.random().toString(36).slice(2, 7)}`, text, done: false })),
          ...extra,
        },
        user,
        { silent: true }
      );
      existing.set(k, issue.id);
      const key = formatIssueKey(project!.key, issue.number);
      (type === "EPIC" ? created.epics : type === "STORY" ? created.stories : created.tasks).push(`${key} ${c.title}`);
      return issue.id;
    }

    const doTasks = async (tasks: Array<Common & { type?: "TASK" | "BUG" }> | undefined, extra: Partial<CreateIssueInput>) => {
      for (const t of tasks ?? []) await ensure(t.type ?? "TASK", t, extra);
    };
    const doStory = async (s: Common & { tasks?: Array<Common & { type?: "TASK" | "BUG" }> }, extra: Partial<CreateIssueInput>) => {
      const storyId = await ensure("STORY", s, extra);
      await doTasks(s.tasks, { parentId: storyId, ...(extra.epicId ? { epicId: extra.epicId } : {}) });
    };

    for (const e of input.epics ?? []) {
      const epicId = await ensure("EPIC", { title: e.title, description: e.description }, e.color ? { epicColor: e.color } : {});
      for (const s of e.stories ?? []) await doStory(s, { epicId });
      await doTasks(e.tasks, { epicId });
    }
    for (const s of input.stories ?? []) await doStory(s, {});
    await doTasks(input.tasks, {});

    // ---- Notas ----
    let notesCreated = 0;
    if (input.notes?.length) {
      const have = new Set((await prisma.note.findMany({ where: { projectId }, select: { title: true } })).map((n) => n.title.trim().toLowerCase()));
      for (const n of input.notes) {
        if (have.has(n.title.trim().toLowerCase())) {
          skipped.push(`NOTA «${n.title}»`);
          continue;
        }
        await prisma.note.create({ data: { projectId, authorId: user.id, title: n.title, body: n.body ?? "", kind: n.kind ?? "GENERAL" } });
        notesCreated++;
      }
    }

    // Un solo aviso para todo el lote (no uno por ticket).
    const createdCount = created.epics.length + created.stories.length + created.tasks.length;
    if (createdCount > 0 || notesCreated > 0) {
      await notifyProject(projectId, {
        title: `Carga en ${project.name}`,
        description: `**${user.name}** agregó ${createdCount} ${createdCount === 1 ? "ticket" : "tickets"}${notesCreated ? ` y ${notesCreated} ${notesCreated === 1 ? "nota" : "notas"}` : ""}.`,
        excludeUserId: user.id,
        url: `${process.env.NEXTAUTH_URL ?? ""}/projects/${projectId}/backlog`,
      });
    }

    return NextResponse.json({
      project: { id: projectId, key: project.key, name: project.name, created: projectCreated, url: `/projects/${projectId}/backlog` },
      created: { ...created, notes: notesCreated },
      skipped,
      warnings,
    });
  } catch (e) {
    if (e instanceof IssueError) return NextResponse.json({ error: e.message }, { status: e.status });
    return errorResponse(e);
  }
}
