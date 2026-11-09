// Política de avisos (código puro): qué llega al instante, qué se agrupa en un resumen y qué queda solo en la bandeja.

export const KINDS = [
  "MENTION", "DIRECT", "URGENT", "HELP", "ANNOUNCE", "REUNION", "ASSIGNED", "SPRINT_START", "TEAM_ADDED", "INVOLVED_ADDED",
  "COMMENT", "COMPLETED", "CREATED", "STATUS", "PROJECT_UPDATE", "SPRINT_COMPLETE",
] as const;
export type NoticeKind = (typeof KINDS)[number];

export type Category = "always" | "tickets" | "assignments" | "team" | "sprints";
type Tier = "instant" | "digest";

export const KIND_META: Record<NoticeKind, { label: string; tier: Tier; category: Category }> = {
  MENTION: { label: "Menciones", tier: "instant", category: "always" },
  DIRECT: { label: "Mensajes directos (/noti persona)", tier: "instant", category: "always" },
  URGENT: { label: "Avisos urgentes", tier: "instant", category: "always" },
  HELP: { label: "Pedidos de ayuda", tier: "instant", category: "always" },
  ANNOUNCE: { label: "Avisos del equipo", tier: "instant", category: "team" },
  REUNION: { label: "Reuniones", tier: "instant", category: "team" },
  TEAM_ADDED: { label: "Te agregaron a un proyecto", tier: "instant", category: "team" },
  ASSIGNED: { label: "Te asignaron un ticket", tier: "instant", category: "assignments" },
  INVOLVED_ADDED: { label: "Te sumaron a un ticket", tier: "instant", category: "assignments" },
  SPRINT_START: { label: "Inicio de sprint", tier: "instant", category: "sprints" },
  COMMENT: { label: "Comentarios en tus tickets", tier: "digest", category: "tickets" },
  COMPLETED: { label: "Tickets completados", tier: "digest", category: "tickets" },
  CREATED: { label: "Tickets nuevos", tier: "digest", category: "tickets" },
  STATUS: { label: "Cambios en tus tickets", tier: "digest", category: "tickets" },
  PROJECT_UPDATE: { label: "Cambios del proyecto", tier: "digest", category: "sprints" },
  SPRINT_COMPLETE: { label: "Cierre de sprint", tier: "digest", category: "sprints" },
};

export const CATEGORY_LABEL: Record<Exclude<Category, "always">, string> = {
  tickets: "Cambios y comentarios en tus tickets",
  assignments: "Asignaciones",
  team: "Avisos y reuniones del equipo",
  sprints: "Sprints y cambios del proyecto",
};

export const DIGEST_OPTIONS = [0, 15, 30, 60, 120] as const; // 0 = solo en la bandeja, sin resumen
export const DEFAULT_DIGEST_MINUTES = 30;
export const ASSIGN_BATCH_MINUTES = 2;

export type Prefs = { digestMinutes: number; quietEnabled: boolean; quietStart: string; quietEnd: string; tz: string; muted: string[] };
export const DEFAULT_PREFS: Prefs = { digestMinutes: DEFAULT_DIGEST_MINUTES, quietEnabled: false, quietStart: "22:00", quietEnd: "07:00", tz: "America/La_Paz", muted: [] };

export const isKind = (v: unknown): v is NoticeKind => typeof v === "string" && (KINDS as readonly string[]).includes(v);
export const isTime = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

// Minutos desde medianoche en la zona horaria de la persona.
export function minutesOfDay(now: Date, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
    return h * 60 + Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

export function isQuiet(now: Date, p: Pick<Prefs, "quietEnabled" | "quietStart" | "quietEnd" | "tz">): boolean {
  if (!p.quietEnabled) return false;
  const m = minutesOfDay(now, p.tz);
  const a = toMin(p.quietStart);
  const b = toMin(p.quietEnd);
  if (a === b) return false;
  return a < b ? m >= a && m < b : m >= a || m < b; // el rango puede cruzar la medianoche
}

// Cuándo termina el silencio (en minutos reales a partir de ahora).
export function quietEndsAt(now: Date, p: Pick<Prefs, "quietStart" | "quietEnd" | "tz">): Date {
  const m = minutesOfDay(now, p.tz);
  const end = toMin(p.quietEnd);
  const delta = (end - m + 1440) % 1440 || 1440;
  return new Date(now.getTime() + delta * 60_000 - (now.getUTCSeconds() * 1000 + now.getUTCMilliseconds()));
}

export type Plan = { tier: "instant" } | { tier: "pending"; deliverAfter: Date; reason: "digest" | "batch" | "quiet" } | { tier: "silent" };

export function planDelivery(kind: NoticeKind, now: Date, prefs: Prefs, ctx: { recentAssigned: number }): Plan {
  const meta = KIND_META[kind];
  if (meta.category !== "always" && prefs.muted.includes(meta.category)) return { tier: "silent" };
  const quiet = isQuiet(now, prefs) && kind !== "URGENT";
  if (meta.tier === "instant") {
    // Varias asignaciones seguidas: la primera avisa ya; las siguientes se juntan en un solo aviso.
    if (kind === "ASSIGNED" && ctx.recentAssigned >= 1) {
      const t = new Date(now.getTime() + ASSIGN_BATCH_MINUTES * 60_000);
      return { tier: "pending", deliverAfter: quiet ? quietEndsAt(now, prefs) : t, reason: quiet ? "quiet" : "batch" };
    }
    if (quiet) return { tier: "pending", deliverAfter: quietEndsAt(now, prefs), reason: "quiet" };
    return { tier: "instant" };
  }
  if (prefs.digestMinutes <= 0) return { tier: "silent" };
  const t = new Date(now.getTime() + prefs.digestMinutes * 60_000);
  return { tier: "pending", deliverAfter: quiet ? new Date(Math.max(t.getTime(), quietEndsAt(now, prefs).getTime())) : t, reason: quiet ? "quiet" : "digest" };
}

export type PendingItem = { kind: NoticeKind; title: string; count: number };

// Un solo aviso con todo lo pendiente.
export function digestMessage(items: PendingItem[]): { title: string; body: string } {
  const total = items.reduce((n, i) => n + i.count, 0);
  if (items.length === 1) {
    const only = items[0];
    return { title: only.count > 1 ? `${only.title} (${only.count} veces)` : only.title, body: "Toca para ver el detalle" };
  }
  if (items.every((i) => i.kind === "ASSIGNED")) {
    return { title: `Te asignaron ${total} tickets`, body: items.slice(0, 4).map((i) => i.title).join(" · ") };
  }
  const byKind = new Map<NoticeKind, number>();
  for (const i of items) byKind.set(i.kind, (byKind.get(i.kind) ?? 0) + i.count);
  const parts = [...byKind.entries()].map(([k, n]) => `${n} ${KIND_META[k].label.toLowerCase()}`);
  const shown = items.slice(0, 3).map((i) => i.title).join(" · ");
  return { title: `Resumen: ${total} novedades`, body: `${parts.join(", ")}. ${shown}${items.length > 3 ? ` y ${items.length - 3} más` : ""}` };
}

export function normalizePrefs(raw: Partial<Prefs> | null | undefined): Prefs {
  const r = raw ?? {};
  return {
    digestMinutes: (DIGEST_OPTIONS as readonly number[]).includes(r.digestMinutes as number) ? (r.digestMinutes as number) : DEFAULT_DIGEST_MINUTES,
    quietEnabled: r.quietEnabled === true,
    quietStart: isTime(r.quietStart) ? r.quietStart : DEFAULT_PREFS.quietStart,
    quietEnd: isTime(r.quietEnd) ? r.quietEnd : DEFAULT_PREFS.quietEnd,
    tz: typeof r.tz === "string" && r.tz.length < 60 ? r.tz : DEFAULT_PREFS.tz,
    muted: Array.isArray(r.muted) ? r.muted.filter((c): c is string => typeof c === "string" && ["tickets", "assignments", "team", "sprints"].includes(c)) : [],
  };
}
