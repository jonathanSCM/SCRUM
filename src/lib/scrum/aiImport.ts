import { z } from "zod";

// Formato del endpoint de importación (POST /api/ai/import): un proyecto con sus
// épicas, historias, tareas y notas en una sola llamada.

const priority = z.enum(["URGENTE", "ALTA", "MEDIA", "BAJA"]);
const base = {
  title: z.string().trim().min(1).max(300),
  description: z.string().max(20000).optional(),
  priority: priority.optional(),
  storyPoints: z.number().int().min(0).max(100).nullable().optional(),
  assignee: z.string().trim().max(200).optional(), // nombre o email de una persona del equipo
  labels: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  // Pasos como texto, o como objetos {text, done?, due?} (formato de la exportación del proyecto).
  checklist: z.array(z.union([z.string().trim().min(1).max(200), z.object({ text: z.string().trim().min(1).max(200), done: z.boolean().optional(), due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish() })])).max(50).optional(),
  dueDate: z.string().trim().refine((v) => !Number.isNaN(Date.parse(v)), "Fecha inválida").optional(),
};

const task = z.object({ ...base, type: z.enum(["TASK", "BUG"]).optional() });
const story = z.object({ ...base, tasks: z.array(task).max(100).optional() });
const epic = z.object({
  title: base.title,
  description: base.description,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  stories: z.array(story).max(100).optional(),
  tasks: z.array(task).max(100).optional(),
});

export const importSchema = z
  .object({
    project: z.object({
      id: z.string().min(1).optional(),
      name: z.string().trim().min(1).max(200).optional(),
      key: z.string().trim().optional(),
      description: z.string().trim().max(5000).optional(),
      deployUrl: z.string().trim().max(500).optional(),
      stack: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
      readyItems: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
    }),
    epics: z.array(epic).max(100).optional(),
    stories: z.array(story).max(200).optional(),
    tasks: z.array(task).max(300).optional(),
    notes: z.array(z.object({ title: z.string().trim().min(1).max(200), body: z.string().max(50000).optional(), kind: z.enum(["BRIEF", "REUNION", "PLANNING", "REVIEW", "GENERAL"]).optional() })).max(50).optional(),
  })
  .refine((v) => !!v.project.id || !!v.project.name, { message: "Indicá project.id (proyecto existente) o project.name (para crearlo)" });

export type ImportInput = z.infer<typeof importSchema>;

export const MAX_IMPORT_ISSUES = 300;

// Cuántos tickets crea una importación (épicas + historias + tareas).
export function countIssues(input: ImportInput): number {
  let n = 0;
  const countTasks = (t?: unknown[]) => (t?.length ?? 0);
  for (const e of input.epics ?? []) {
    n += 1 + countTasks(e.tasks);
    for (const s of e.stories ?? []) n += 1 + countTasks(s.tasks);
  }
  for (const s of input.stories ?? []) n += 1 + countTasks(s.tasks);
  n += countTasks(input.tasks);
  return n;
}

// Busca a una persona del equipo por email o nombre (sin mayúsculas ni acentos).
export function matchMember<T extends { id: string; name: string; email: string }>(members: T[], query: string): T | null {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  const q = norm(query);
  if (!q) return null;
  return members.find((m) => norm(m.email) === q) ?? members.find((m) => norm(m.name) === q) ?? (members.filter((m) => norm(m.name).startsWith(q) || norm(m.name).split(" ").includes(q)).length === 1 ? members.find((m) => norm(m.name).startsWith(q) || norm(m.name).split(" ").includes(q)) ?? null : null);
}

export const issueKeyOf = (type: string, title: string) => `${type}:${title.trim().toLowerCase()}`;


// ---- Cambios sobre tickets que ya existen (se identifican por su clave, ej. SAI-12) ----
export const MAX_CHANGES = 300;

export const changesSchema = z.object({
  project: z.object({ id: z.string().min(1) }),
  changes: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(40),
        title: z.string().trim().min(1).max(300).optional(),
        description: z.string().max(20000).optional(),
        status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]).optional(),
        priority: priority.optional(),
        storyPoints: z.number().int().min(0).max(100).nullable().optional(),
        assignee: z.string().trim().max(200).nullable().optional(), // nombre o email; null = sin responsable
        sprint: z.string().trim().max(200).nullable().optional(), // nombre del sprint; null = al backlog
        labels: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
        dueDate: z.string().trim().refine((v) => !Number.isNaN(Date.parse(v)), "Fecha inválida").nullable().optional(),
        comment: z.string().trim().min(1).max(5000).optional(),
      })
    )
    .min(1)
    .max(MAX_CHANGES),
});

export type ChangesInput = z.infer<typeof changesSchema>;

// ---- Exportación editada: el mismo JSON que se exporta sirve para actualizar y para agregar ----
// Los tickets que traen "key" (ya existen) se convierten en cambios (solo se aplica lo que difiere);
// los que NO traen key se importan como nuevos (bajo su historia o épica por título).
type Loose = Record<string, unknown>;
const isObj = (v: unknown): v is Loose => !!v && typeof v === "object" && !Array.isArray(v);
const arr = (v: unknown): Loose[] => (Array.isArray(v) ? v.filter(isObj) : []);
const STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"];
const PRIORITIES = ["URGENTE", "ALTA", "MEDIA", "BAJA"];

export type SplitExport = {
  projectId: string;
  changes: Array<Loose & { key: string }>;
  newImport: Loose | null;
  existing: number;
  fresh: number;
  anonymized: boolean;
};

export function isExportShape(json: unknown): boolean {
  if (!isObj(json) || !isObj(json.project) || typeof json.project.id !== "string") return false;
  if (isObj(json._meta) && json._meta.format === "scrum-proshop-export") return true;
  const hasKey = (items: Loose[]): boolean => items.some((i) => typeof i.key === "string" || hasKey(arr(i.stories)) || hasKey(arr(i.tasks)));
  return hasKey(arr(json.epics)) || hasKey(arr(json.stories)) || hasKey(arr(json.tasks));
}

export function splitExport(json: unknown): SplitExport | null {
  if (!isExportShape(json)) return null;
  const root = json as Loose;
  const project = root.project as Loose;
  const anonymized = isObj(root._meta) && root._meta.anonimizado === true;
  const changes: SplitExport["changes"] = [];
  let fresh = 0;

  const changeOf = (it: Loose): SplitExport["changes"][number] => {
    const c: Loose & { key: string } = { key: String(it.key) };
    if (typeof it.title === "string") c.title = it.title;
    if (typeof it.description === "string") c.description = it.description;
    if (typeof it.status === "string" && STATUSES.includes(it.status)) c.status = it.status;
    if (typeof it.priority === "string" && PRIORITIES.includes(it.priority)) c.priority = it.priority;
    if (typeof it.storyPoints === "number" || it.storyPoints === null) c.storyPoints = it.storyPoints;
    if (typeof it.assignee === "string" && !anonymized) c.assignee = it.assignee;
    if (typeof it.sprint === "string") c.sprint = it.sprint;
    if (Array.isArray(it.labels)) c.labels = it.labels.filter((l): l is string => typeof l === "string");
    if (typeof it.dueDate === "string") c.dueDate = it.dueDate;
    return c;
  };
  const newFields = (it: Loose): Loose => {
    const o: Loose = { title: it.title };
    for (const k of ["description", "priority", "storyPoints", "labels", "dueDate", "checklist", "type"]) if (it[k] !== undefined) o[k] = it[k];
    if (typeof it.assignee === "string" && !anonymized) o.assignee = it.assignee;
    if (o.type !== "TASK" && o.type !== "BUG") delete o.type;
    return o;
  };

  // Devuelve la versión "solo lo nuevo" de un ticket (o null si no hay nada nuevo en él ni debajo).
  const walk = (it: Loose, level: "epic" | "story" | "task"): Loose | null => {
    const has = typeof it.key === "string";
    if (has) changes.push(changeOf(it));
    const stories = level === "epic" ? arr(it.stories).map((s) => walk(s, "story")).filter((x): x is Loose => !!x) : [];
    const tasks = level !== "task" ? arr(it.tasks).map((t) => walk(t, "task")).filter((x): x is Loose => !!x) : [];
    if (!has) fresh++;
    if (!has) return { ...newFields(it), ...(stories.length ? { stories } : {}), ...(tasks.length ? { tasks } : {}) };
    if (stories.length || tasks.length) return { title: it.title, ...(stories.length ? { stories } : {}), ...(tasks.length ? { tasks } : {}) };
    return null;
  };

  const epics = arr(root.epics).map((e) => walk(e, "epic")).filter((x): x is Loose => !!x);
  const stories = arr(root.stories).map((s) => walk(s, "story")).filter((x): x is Loose => !!x);
  const tasks = arr(root.tasks).map((t) => walk(t, "task")).filter((x): x is Loose => !!x);
  const newImport = epics.length || stories.length || tasks.length ? { project: { id: project.id }, ...(epics.length ? { epics } : {}), ...(stories.length ? { stories } : {}), ...(tasks.length ? { tasks } : {}) } : null;
  return { projectId: project.id as string, changes, newImport, existing: changes.length, fresh, anonymized };
}
