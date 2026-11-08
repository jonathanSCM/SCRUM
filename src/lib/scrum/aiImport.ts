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
