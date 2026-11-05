// Utilidades del resumen semanal del perfil público (código puro, con tests).

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type WeekWindow = { since: Date; prevSince: Date; sinceDay: string; prevSinceDay: string };

// Últimos 7 días (móvil) y los 7 anteriores, para comparar.
export function weekWindow(now: Date = new Date()): WeekWindow {
  const since = new Date(now.getTime() - WEEK_MS);
  const prevSince = new Date(now.getTime() - 2 * WEEK_MS);
  return { since, prevSince, sinceDay: since.toISOString().slice(0, 10), prevSinceDay: prevSince.toISOString().slice(0, 10) };
}

// "+3 vs semana pasada", "igual que la semana pasada", etc.
export function compareLabel(current: number, previous: number): { text: string; tone: "up" | "down" | "same" } {
  const diff = current - previous;
  if (diff === 0) return { text: "igual que la semana pasada", tone: "same" };
  return { text: `${diff > 0 ? "+" : "−"}${Math.abs(diff)} vs semana pasada`, tone: diff > 0 ? "up" : "down" };
}

export type ProjectActivity = { projectId: string; open: number; completed: number; created: number; notes: number };

// Une los conteos por proyecto y deja solo los proyectos donde la persona está activa
// (tiene tickets abiertos o hizo algo esta semana), los más cargados primero.
export function mergeProjectActivity(parts: Array<Map<string, number>>, keys: Array<keyof Omit<ProjectActivity, "projectId">>): ProjectActivity[] {
  const all = new Map<string, ProjectActivity>();
  parts.forEach((m, i) => {
    for (const [projectId, n] of m) {
      const row = all.get(projectId) ?? { projectId, open: 0, completed: 0, created: 0, notes: 0 };
      row[keys[i]] += n;
      all.set(projectId, row);
    }
  });
  return [...all.values()]
    .filter((r) => r.open + r.completed + r.created + r.notes > 0)
    .sort((a, b) => b.completed + b.open - (a.completed + a.open) || b.created - a.created);
}
