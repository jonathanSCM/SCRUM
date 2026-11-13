// Actividad del equipo (código puro, con tests): qué hizo cada persona en el sistema y a qué hora.
// Se cuenta trabajo en proyectos, tickets, sprints, notas y dailys. NO se cuenta el chat ni lo que se escribe en él.
import { dayKey, zonedParts, zonedToUtc } from "./countries";

export type ActivityKind = "CREATE" | "MOVE" | "UPDATE" | "COMMENT" | "DAILY" | "DELETE";

export const KIND_META: Record<ActivityKind, { label: string; color: string }> = {
  CREATE: { label: "Creó", color: "var(--c-story)" },
  MOVE: { label: "Movió", color: "var(--c-progress)" },
  UPDATE: { label: "Actualizó", color: "var(--c-task)" },
  COMMENT: { label: "Comentó", color: "var(--c-review)" },
  DAILY: { label: "Daily", color: "var(--c-epic)" },
  DELETE: { label: "Eliminó", color: "var(--c-bug)" },
};
export const KINDS = Object.keys(KIND_META) as ActivityKind[];

const CREATE_FIELDS = new Set(["ticket_creado", "tarea_creada", "proyecto_creado", "sprint_creado", "nota_creada", "nota_a_tickets", "retro_a_ticket", "archivo_agregado", "enlace_agregado", "adjunto_subido", "documento_subido"]);

// Qué tipo de acción es una entrada del historial.
export function kindOfField(field: string): ActivityKind {
  if (CREATE_FIELDS.has(field)) return "CREATE";
  if (field === "estado_ticket" || field === "tipo_tarea") return "MOVE";
  if (field === "comentario") return "COMMENT";
  if (field.includes("eliminad") || field.includes("borrad")) return "DELETE";
  return "UPDATE";
}

export type RawEvent = { userId: string; at: Date; kind: ActivityKind; projectId: string | null; taskId: string | null; field: string; done?: boolean };

const RANK: Record<ActivityKind, number> = { CREATE: 5, MOVE: 4, COMMENT: 3, DAILY: 3, DELETE: 2, UPDATE: 1 };

// Guardar un ticket con varios cambios deja varias filas en el historial: aquí cuenta como UNA acción
// (misma persona, mismo ticket —o mismo proyecto y campo— y el mismo minuto). Gana la más importante.
export function collapseActions(events: RawEvent[]): RawEvent[] {
  const best = new Map<string, RawEvent>();
  for (const e of events) {
    const key = `${e.userId}|${e.taskId ?? `${e.projectId}:${e.field}`}|${Math.floor(e.at.getTime() / 60_000)}`;
    const cur = best.get(key);
    if (!cur || RANK[e.kind] > RANK[cur.kind]) best.set(key, { ...e, done: e.done || cur?.done });
    else if (e.done) cur.done = true;
  }
  return [...best.values()].sort((a, b) => a.at.getTime() - b.at.getTime());
}

// Lunes ("YYYY-MM-DD") de la semana en la que cae `now` según la zona `tz`.
export function mondayOf(now: Date, tz: string): string {
  const key = dayKey(now, tz);
  const dow = new Date(`${key}T00:00:00Z`).getUTCDay(); // 0 domingo
  return shiftDay(key, -((dow + 6) % 7));
}

export function shiftDay(value: string, days: number): string {
  const d = new Date(`${value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isMonday(value: string): boolean {
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value && d.getUTCDay() === 1;
}

// Los 7 días de la semana (lunes a domingo) y el rango de instantes UTC que cubren en `tz`.
export function weekBounds(monday: string, tz: string): { days: string[]; from: Date; to: Date } {
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(monday, i));
  const at = (v: string) => {
    const [y, m, d] = v.split("-").map(Number);
    return zonedToUtc(y, m, d, 0, 0, tz);
  };
  return { days, from: at(days[0]), to: at(shiftDay(monday, 7)) };
}

export type UserActivity = {
  userId: string;
  total: number;
  byKind: Record<ActivityKind, number>;
  byDay: number[]; // 7, lunes a domingo
  heat: number[][]; // 7 x 24 (día x hora)
  byHour: number[]; // 24
  firstLast: Array<{ first: number; last: number } | null>; // por día: minutos desde las 00:00 de la primera y la última acción
  activeDays: number;
  completed: number;
  tasks: number; // tickets distintos tocados
  projects: number; // proyectos distintos tocados
  peakHour: number | null;
};

const emptyUser = (userId: string): UserActivity => ({
  userId,
  total: 0,
  byKind: { CREATE: 0, MOVE: 0, UPDATE: 0, COMMENT: 0, DAILY: 0, DELETE: 0 },
  byDay: Array(7).fill(0),
  heat: Array.from({ length: 7 }, () => Array(24).fill(0)),
  byHour: Array(24).fill(0),
  firstLast: Array(7).fill(null),
  activeDays: 0,
  completed: 0,
  tasks: 0,
  projects: 0,
  peakHour: null,
});

// Resumen por persona de una semana (`days` = los 7 "YYYY-MM-DD"), con las horas en la zona `tz`.
export function summarizeActivity(actions: RawEvent[], days: string[], tz: string, userIds: string[]): Map<string, UserActivity> {
  const out = new Map(userIds.map((id) => [id, emptyUser(id)]));
  const tasks = new Map<string, Set<string>>();
  const projects = new Map<string, Set<string>>();
  for (const a of actions) {
    const u = out.get(a.userId);
    if (!u) continue;
    const z = zonedParts(a.at, tz);
    const day = days.indexOf(`${z.year}-${String(z.month).padStart(2, "0")}-${String(z.day).padStart(2, "0")}`);
    if (day < 0) continue;
    u.total++;
    u.byKind[a.kind]++;
    u.byDay[day]++;
    u.heat[day][z.hour]++;
    u.byHour[z.hour]++;
    if (a.done) u.completed++;
    const minutes = z.hour * 60 + z.minute;
    const fl = u.firstLast[day];
    u.firstLast[day] = fl ? { first: Math.min(fl.first, minutes), last: Math.max(fl.last, minutes) } : { first: minutes, last: minutes };
    if (a.taskId) tasks.set(a.userId, (tasks.get(a.userId) ?? new Set()).add(a.taskId));
    if (a.projectId) projects.set(a.userId, (projects.get(a.userId) ?? new Set()).add(a.projectId));
  }
  for (const u of out.values()) {
    u.activeDays = u.byDay.filter((n) => n > 0).length;
    u.tasks = tasks.get(u.userId)?.size ?? 0;
    u.projects = projects.get(u.userId)?.size ?? 0;
    const max = Math.max(...u.byHour);
    u.peakHour = max > 0 ? u.byHour.indexOf(max) : null;
  }
  return out;
}

export const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
