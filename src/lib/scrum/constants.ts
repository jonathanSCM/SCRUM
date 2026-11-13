// Vocabulario Scrum de la app: tipos de ticket, estados del flujo, prioridades.
// Los valores (claves) son lo que se guarda en la base; las etiquetas y colores
// son solo para mostrar.

export const ISSUE_TYPES = ["EPIC", "STORY", "TASK", "BUG"] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const ISSUE_TYPE_META: Record<IssueType, { label: string; plural: string; color: string }> = {
  EPIC: { label: "Épica", plural: "Épicas", color: "var(--c-epic)" },
  STORY: { label: "Historia", plural: "Historias", color: "var(--c-story)" },
  TASK: { label: "Tarea", plural: "Tareas", color: "var(--c-task)" },
  BUG: { label: "Bug", plural: "Bugs", color: "var(--c-bug)" },
};

export const STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "DONE"] as const;
export type IssueStatus = (typeof STATUSES)[number];

export const STATUS_META: Record<IssueStatus, { label: string; color: string }> = {
  TODO: { label: "Por hacer", color: "var(--c-todo)" },
  IN_PROGRESS: { label: "En progreso", color: "var(--c-progress)" },
  BLOCKED: { label: "Bloqueadas", color: "var(--c-blocked)" },
  IN_REVIEW: { label: "En revisión", color: "var(--c-review)" },
  DONE: { label: "Hecho", color: "var(--c-done)" },
};

export const DONE_STATUS: IssueStatus = "DONE";

export const PRIORITIES = ["URGENTE", "ALTA", "MEDIA", "BAJA"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_META: Record<Priority, { label: string; color: string; weight: number }> = {
  URGENTE: { label: "Urgente", color: "var(--c-urgent)", weight: 4 },
  ALTA: { label: "Alta", color: "var(--c-high)", weight: 3 },
  MEDIA: { label: "Media", color: "var(--c-medium)", weight: 2 },
  BAJA: { label: "Baja", color: "var(--c-low)", weight: 1 },
};

export const SPRINT_STATES = ["PLANNED", "ACTIVE", "COMPLETED"] as const;
export type SprintState = (typeof SPRINT_STATES)[number];

export const SPRINT_STATE_META: Record<SprintState, { label: string; color: string }> = {
  PLANNED: { label: "Planificado", color: "var(--c-todo)" },
  ACTIVE: { label: "Activo", color: "var(--c-done)" },
  COMPLETED: { label: "Completado", color: "var(--c-progress)" },
};

// Escala de story points (Fibonacci acotada, como Jira).
export const STORY_POINT_OPTIONS = [1, 2, 3, 5, 8, 13, 21] as const;

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export const DEFAULT_PROJECT_STATUSES = [
  { name: "Pendiente", color: "#6f6a88", order: 0 },
  { name: "En progreso", color: "#6d28d9", order: 1 },
  { name: "En revisión", color: "#b45309", order: 2 },
  { name: "Pausado", color: "#dc2626", order: 3 },
  { name: "En producción", color: "#2563eb", order: 4 },
  { name: "Completado", color: "#059669", order: 5 },
] as const;

export function isIssueType(value: unknown): value is IssueType {
  return typeof value === "string" && (ISSUE_TYPES as readonly string[]).includes(value);
}
export function isIssueStatus(value: unknown): value is IssueStatus {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}
export function isPriority(value: unknown): value is Priority {
  return typeof value === "string" && (PRIORITIES as readonly string[]).includes(value);
}
