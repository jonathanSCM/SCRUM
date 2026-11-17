// Reuniones recurrentes (código puro, con tests): la regla de repetición y las fechas que genera.
// Las fechas son "YYYY-MM-DD" del calendario de la zona de la serie; la hora del día se aplica aparte, así que
// "10:00" se mantiene en 10:00 aunque cambie el horario de verano.

export const FREQS = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type Freq = (typeof FREQS)[number];

export type RepeatRule = {
  freq: Freq;
  interval: number; // cada N días / semanas / meses
  weekdays: number[]; // solo WEEKLY: 1 = lunes … 7 = domingo (vacío = el día de la fecha de inicio)
  until: string | null; // última fecha posible (inclusive)
  count: number | null; // total de reuniones de la serie
};

const MAX_INTERVAL: Record<Freq, number> = { DAILY: 30, WEEKLY: 12, MONTHLY: 12 };
export const MAX_COUNT = 365;
export const MAX_SPAN_DAYS = 2 * 366; // una serie no pasa de dos años

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isDateString = (v: unknown): v is string => {
  if (typeof v !== "string" || !DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// 1 = lunes … 7 = domingo
export function isoWeekday(date: string): number {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return dow === 0 ? 7 : dow;
}

export const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate(); // month: 1-12
}

// Limpia y valida lo que llega de fuera (formulario o API). Devuelve la regla o un texto de error.
export function normalizeRule(input: unknown, startDate: string): { rule: RepeatRule } | { error: string } {
  const r = (input ?? {}) as Partial<Record<keyof RepeatRule, unknown>>;
  if (!FREQS.includes(r.freq as Freq)) return { error: "Elige cada cuánto se repite" };
  const freq = r.freq as Freq;
  const interval = r.interval === undefined || r.interval === null ? 1 : Number(r.interval);
  if (!Number.isInteger(interval) || interval < 1 || interval > MAX_INTERVAL[freq]) return { error: `«Cada» debe ser un número de 1 a ${MAX_INTERVAL[freq]}` };
  let weekdays: number[] = [];
  if (freq === "WEEKLY") {
    const raw = Array.isArray(r.weekdays) ? r.weekdays : [];
    weekdays = [...new Set(raw.map(Number))].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort((a, b) => a - b);
    // La primera fecha siempre es una reunión de la serie: su día de la semana va incluido.
    if (!weekdays.includes(isoWeekday(startDate))) weekdays = [...weekdays, isoWeekday(startDate)].sort((a, b) => a - b);
  }
  const until = r.until === undefined || r.until === null || r.until === "" ? null : r.until;
  if (until !== null) {
    if (!isDateString(until)) return { error: "La fecha de término no es válida" };
    if (until < startDate) return { error: "La serie no puede terminar antes de empezar" };
    if (daysBetween(startDate, until) > MAX_SPAN_DAYS) return { error: "Una serie dura como máximo dos años" };
  }
  const count = r.count === undefined || r.count === null || r.count === "" ? null : Number(r.count);
  if (count !== null && (!Number.isInteger(count) || count < 2 || count > MAX_COUNT)) return { error: `El número de veces va de 2 a ${MAX_COUNT}` };
  return { rule: { freq, interval, weekdays, until, count: until !== null && count !== null ? null : count } }; // si hay fecha de término, esa manda
}

// Fechas de la serie hasta `to` (inclusive), contando desde la primera. `skip` son las fechas que se quitaron una a una
// (siguen contando para el total, como en un calendario normal). Empieza en `startDate`.
export function occurrenceDates(startDate: string, rule: RepeatRule, opts: { to: string; from?: string; skip?: string[] }): string[] {
  const skip = new Set(opts.skip ?? []);
  const last = rule.until !== null && rule.until < opts.to ? rule.until : opts.to;
  const out: string[] = [];
  let produced = 0;
  const push = (d: string): boolean => {
    // true = seguir
    if (d < startDate) return true;
    if (d > last) return false;
    if (rule.count !== null && produced >= rule.count) return false;
    produced++;
    if (!skip.has(d) && (!opts.from || d >= opts.from)) out.push(d);
    return true;
  };
  const cap = 6000; // tope de seguridad
  if (rule.freq === "DAILY") {
    for (let i = 0, d = startDate; i < cap; i++, d = addDays(d, rule.interval)) if (!push(d)) break;
  } else if (rule.freq === "WEEKLY") {
    const days = rule.weekdays.length ? rule.weekdays : [isoWeekday(startDate)];
    const monday = addDays(startDate, -(isoWeekday(startDate) - 1));
    outer: for (let w = 0; w < cap; w++) {
      const base = addDays(monday, w * 7 * rule.interval);
      if (base > last) break;
      for (const wd of days) if (!push(addDays(base, wd - 1))) break outer;
    }
  } else {
    const [y0, m0, day] = startDate.split("-").map(Number);
    for (let k = 0; k < cap; k++) {
      const idx = m0 - 1 + k * rule.interval;
      const year = y0 + Math.floor(idx / 12);
      const month = (idx % 12) + 1;
      const d = `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDayOfMonth(year, month))).padStart(2, "0")}`;
      if (!push(d)) break;
    }
  }
  return out;
}

const DAY_PLURAL = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];
const MONTH_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const dateLabel = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return `${day} de ${MONTH_NAMES[m - 1]} de ${y}`;
};

function joinList(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

// "Cada semana los lunes y miércoles, hasta el 30 de diciembre de 2026"
export function describeRule(startDate: string, rule: RepeatRule): string {
  let base: string;
  if (rule.freq === "DAILY") base = rule.interval === 1 ? "Todos los días" : `Cada ${rule.interval} días`;
  else if (rule.freq === "WEEKLY") {
    const days = rule.weekdays.length ? rule.weekdays : [isoWeekday(startDate)];
    const isWorkweek = days.length === 5 && days.join() === "1,2,3,4,5";
    if (isWorkweek && rule.interval === 1) base = "De lunes a viernes";
    else {
      base = `${rule.interval === 1 ? "Cada semana" : `Cada ${rule.interval} semanas`} los ${joinList(days.map((d) => DAY_PLURAL[d - 1]))}`;
    }
  } else {
    const day = Number(startDate.split("-")[2]);
    base = `${rule.interval === 1 ? "Cada mes" : `Cada ${rule.interval} meses`} el día ${day}`;
  }
  if (rule.until) return `${base}, hasta el ${dateLabel(rule.until)}`;
  if (rule.count) return `${base}, ${rule.count} veces`;
  return base;
}

// ---- Borrador del formulario <-> regla ----

export type RepeatKind = "none" | "daily" | "weekdays" | "weekly" | "monthly";
export type RepeatDraft = { kind: RepeatKind; interval: number; weekdays: number[]; end: "never" | "until" | "count"; until: string; count: number };
export const EMPTY_DRAFT: RepeatDraft = { kind: "none", interval: 1, weekdays: [], end: "never", until: "", count: 10 };

export function draftToRule(d: RepeatDraft, startDate: string): { rule: RepeatRule } | { error: string } | null {
  if (d.kind === "none") return null;
  const freq: Freq = d.kind === "daily" ? "DAILY" : d.kind === "monthly" ? "MONTHLY" : "WEEKLY";
  return normalizeRule(
    { freq, interval: d.kind === "weekdays" ? 1 : d.interval, weekdays: d.kind === "weekdays" ? [1, 2, 3, 4, 5] : d.weekdays, until: d.end === "until" ? d.until : null, count: d.end === "count" ? d.count : null },
    startDate
  );
}

export function ruleToDraft(rule: RepeatRule): RepeatDraft {
  const isWorkweek = rule.freq === "WEEKLY" && rule.interval === 1 && rule.weekdays.join() === "1,2,3,4,5";
  return {
    kind: isWorkweek ? "weekdays" : rule.freq === "DAILY" ? "daily" : rule.freq === "MONTHLY" ? "monthly" : "weekly",
    interval: rule.interval,
    weekdays: rule.weekdays,
    end: rule.until ? "until" : rule.count ? "count" : "never",
    until: rule.until ?? "",
    count: rule.count ?? 10,
  };
}
