// Vocabulario Scrum de la app: tipos de ticket, estados del flujo, prioridades.
// Los valores (claves) son lo que se guarda en la base; las etiquetas y colores
// son solo para mostrar.

export const ISSUE_TYPES = ["EPIC", "STORY", "TASK", "BUG"] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const ISSUE_TYPE_META: Record<IssueType, { label: string; plural: string; color: string }> = {
  EPIC: { label: "Épica", plural: "Épicas", color: "#c084fc" },
  STORY: { label: "Historia", plural: "Historias", color: "#2fe3a6" },
  TASK: { label: "Tarea", plural: "Tareas", color: "#60a5fa" },
  BUG: { label: "Bug", plural: "Bugs", color: "#fb7185" },
};

export const STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const;
export type IssueStatus = (typeof STATUSES)[number];

export const STATUS_META: Record<IssueStatus, { label: string; color: string }> = {
  TODO: { label: "Por hacer", color: "#a996c9" },
  IN_PROGRESS: { label: "En progreso", color: "#8b5cf6" },
  IN_REVIEW: { label: "En revisión", color: "#ffb020" },
  DONE: { label: "Hecho", color: "#2fe3a6" },
};

export const DONE_STATUS: IssueStatus = "DONE";

export const PRIORITIES = ["URGENTE", "ALTA", "MEDIA", "BAJA"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_META: Record<Priority, { label: string; color: string; weight: number }> = {
  URGENTE: { label: "Urgente", color: "#fb7185", weight: 4 },
  ALTA: { label: "Alta", color: "#ffb020", weight: 3 },
  MEDIA: { label: "Media", color: "#c084fc", weight: 2 },
  BAJA: { label: "Baja", color: "#60a5fa", weight: 1 },
};

export const SPRINT_STATES = ["PLANNED", "ACTIVE", "COMPLETED"] as const;
export type SprintState = (typeof SPRINT_STATES)[number];

export const SPRINT_STATE_META: Record<SprintState, { label: string; color: string }> = {
  PLANNED: { label: "Planificado", color: "#a996c9" },
  ACTIVE: { label: "Activo", color: "#2fe3a6" },
  COMPLETED: { label: "Completado", color: "#8b5cf6" },
};

// Escala de story points (Fibonacci acotada, como Jira).
export const STORY_POINT_OPTIONS = [1, 2, 3, 5, 8, 13, 21] as const;

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export const DEFAULT_PROJECT_STATUSES = [
  { name: "Pendiente", color: "#a996c9", order: 0 },
  { name: "En progreso", color: "#8b5cf6", order: 1 },
  { name: "En revisión", color: "#ffb020", order: 2 },
  { name: "Pausado", color: "#fb7185", order: 3 },
  { name: "En producción", color: "#60a5fa", order: 4 },
  { name: "Completado", color: "#2fe3a6", order: 5 },
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
