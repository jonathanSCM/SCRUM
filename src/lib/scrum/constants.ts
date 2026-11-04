// Vocabulario Scrum de la app: tipos de ticket, estados del flujo, prioridades.
// Los valores (claves) son lo que se guarda en la base; las etiquetas y colores
// son solo para mostrar.

export const ISSUE_TYPES = ["EPIC", "STORY", "TASK", "BUG"] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const ISSUE_TYPE_META: Record<IssueType, { label: string; plural: string; color: string }> = {
  EPIC: { label: "Épica", plural: "Épicas", color: "#7c3aed" },
  STORY: { label: "Historia", plural: "Historias", color: "#059669" },
  TASK: { label: "Tarea", plural: "Tareas", color: "#2563eb" },
  BUG: { label: "Bug", plural: "Bugs", color: "#dc2626" },
};

export const STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const;
export type IssueStatus = (typeof STATUSES)[number];

export const STATUS_META: Record<IssueStatus, { label: string; color: string }> = {
  TODO: { label: "Por hacer", color: "#6f6a88" },
  IN_PROGRESS: { label: "En progreso", color: "#6d28d9" },
  IN_REVIEW: { label: "En revisión", color: "#b45309" },
  DONE: { label: "Hecho", color: "#059669" },
};

export const DONE_STATUS: IssueStatus = "DONE";

export const PRIORITIES = ["URGENTE", "ALTA", "MEDIA", "BAJA"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_META: Record<Priority, { label: string; color: string; weight: number }> = {
  URGENTE: { label: "Urgente", color: "#dc2626", weight: 4 },
  ALTA: { label: "Alta", color: "#b45309", weight: 3 },
  MEDIA: { label: "Media", color: "#7c3aed", weight: 2 },
  BAJA: { label: "Baja", color: "#2563eb", weight: 1 },
};

export const SPRINT_STATES = ["PLANNED", "ACTIVE", "COMPLETED"] as const;
export type SprintState = (typeof SPRINT_STATES)[number];

export const SPRINT_STATE_META: Record<SprintState, { label: string; color: string }> = {
  PLANNED: { label: "Planificado", color: "#6f6a88" },
  ACTIVE: { label: "Activo", color: "#059669" },
  COMPLETED: { label: "Completado", color: "#6d28d9" },
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
