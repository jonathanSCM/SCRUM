// Velocidad: lo comprometido vs. lo completado en los últimos sprints cerrados.
// Se usan los números congelados al cerrar cada sprint (Sprint.committed* /
// completed*), como el reporte de Jira.

export type VelocitySprint = {
  id: string;
  name: string;
  state: string;
  completedAt: Date | string | null;
  startDate: Date | string | null;
  committedPoints: number;
  completedPoints: number;
  committedCount: number;
  completedCount: number;
};

export type VelocityBar = {
  id: string;
  name: string;
  committed: number;
  completed: number;
};

export type VelocityResult = {
  unit: "points" | "count";
  bars: VelocityBar[];
  average: number;
};

function sortKey(s: VelocitySprint): number {
  const value = s.completedAt ?? s.startDate;
  return value ? new Date(value).getTime() : 0;
}

export function computeVelocity(sprints: VelocitySprint[], limit = 7): VelocityResult {
  const closed = sprints.filter((s) => s.state === "COMPLETED").sort((a, b) => sortKey(a) - sortKey(b));
  const recent = closed.slice(-limit);

  const anyPoints = recent.some((s) => s.committedPoints > 0 || s.completedPoints > 0);
  const unit: "points" | "count" = anyPoints ? "points" : "count";

  const bars = recent.map((s) => ({
    id: s.id,
    name: s.name,
    committed: unit === "points" ? s.committedPoints : s.committedCount,
    completed: unit === "points" ? s.completedPoints : s.completedCount,
  }));
  const average = bars.length ? Math.round((bars.reduce((sum, b) => sum + b.completed, 0) / bars.length) * 10) / 10 : 0;
  return { unit, bars, average };
}
