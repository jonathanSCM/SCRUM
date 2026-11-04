// Plantillas y utilidades de las ceremonias Scrum (código puro, con tests).

export const RETRO_COLUMN_META = {
  WENT_WELL: { label: "Qué funcionó", hint: "Lo que queremos repetir" },
  IMPROVE: { label: "Qué mejorar", hint: "Lo que nos frenó o molestó" },
  ACTION: { label: "Acuerdos", hint: "Qué vamos a hacer distinto" },
} as const;

export type RetroColumn = keyof typeof RETRO_COLUMN_META;

export const PLANNING_TEMPLATE = [
  "Objetivo del sprint:",
  "",
  "Capacidad del equipo (personas / días / puntos):",
  "",
  "Tickets comprometidos (con su Definition of Ready revisada):",
  "- ",
  "",
  "Dudas pendientes del Product Owner:",
  "- ",
].join("\n");

export const REVIEW_TEMPLATE = [
  "Lo que se entregó:",
  "- ",
  "",
  "Lo que no se terminó (y por qué):",
  "- ",
  "",
  "Feedback del Product Owner / cliente:",
  "- ",
  "",
  "Cambios al backlog a partir de lo visto:",
  "- ",
].join("\n");

// "YYYY-MM-DD" válido (rechaza 2026-02-31).
export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// Fecha local del navegador como "YYYY-MM-DD".
export function localDateString(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function shiftDate(value: string, days: number): string {
  const d = new Date(`${value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Quién del equipo todavía no dejó su daily ese día.
export function missingStandups(members: Array<{ id: string; name: string }>, doneUserIds: string[]): string[] {
  const done = new Set(doneUserIds);
  return members.filter((m) => !done.has(m.id)).map((m) => m.name);
}

export type ReviewSummary = {
  committed: number;
  completed: number;
  committedPoints: number;
  completedPoints: number;
  done: Array<{ key: string; title: string }>;
  notDone: Array<{ key: string; title: string; status: string }>;
};

export function summarizeReview(tickets: Array<{ key: string; title: string; status: string; points: number | null }>): ReviewSummary {
  const done = tickets.filter((t) => t.status === "DONE");
  const notDone = tickets.filter((t) => t.status !== "DONE");
  const sum = (list: typeof tickets) => list.reduce((acc, t) => acc + (t.points ?? 0), 0);
  return {
    committed: tickets.length,
    completed: done.length,
    committedPoints: sum(tickets),
    completedPoints: sum(done),
    done: done.map((t) => ({ key: t.key, title: t.title })),
    notDone: notDone.map((t) => ({ key: t.key, title: t.title, status: t.status })),
  };
}
