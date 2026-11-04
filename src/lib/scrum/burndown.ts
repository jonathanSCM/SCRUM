// Burndown de un sprint: trabajo restante (en story points, o en cantidad de
// tickets si nadie estimó) contra el tiempo, con la línea ideal y el alcance
// agregado una vez iniciado el sprint.
//
// Limitación conocida (igual que un burndown simple de Jira): solo se ven los
// tickets que HOY pertenecen al sprint; si uno se sacó a mitad del sprint no
// queda rastro de que estuvo. Los días se cortan en UTC.

export type BurndownTask = {
  storyPoints: number | null;
  sprintAddedAt: Date | string | null;
  completedAt: Date | string | null;
  status: string;
};

export type BurndownInput = {
  startedAt: Date | string; // inicio real (o la fecha de inicio planificada)
  endDate: Date | string;
  completedAt?: Date | string | null; // si el sprint ya cerró
  tasks: BurndownTask[];
  now?: Date;
};

export type BurndownPoint = {
  label: string; // YYYY-MM-DD (día que termina en este punto) o "inicio"
  date: string; // ISO del corte
  ideal: number;
  remaining: number | null; // null = todavía no llegó ese día
};

export type BurndownResult = {
  unit: "points" | "count";
  committed: number;
  scopeAdded: number;
  completed: number;
  points: BurndownPoint[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function startOfDayUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function endOfDayUTC(date: Date): Date {
  return new Date(startOfDayUTC(date).getTime() + DAY_MS - 1);
}

export function formatDayUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function computeBurndown(input: BurndownInput): BurndownResult {
  const now = input.now ?? new Date();
  const start = toDate(input.startedAt);
  const startDay = startOfDayUTC(start);
  const endDay = startOfDayUTC(toDate(input.endDate));
  const dayCount = Math.max(1, Math.round((endDay.getTime() - startDay.getTime()) / DAY_MS) + 1);

  const hasPoints = input.tasks.some((t) => (t.storyPoints ?? 0) > 0);
  const unit: "points" | "count" = hasPoints ? "points" : "count";
  const weight = (t: BurndownTask) => (unit === "points" ? t.storyPoints ?? 0 : 1);

  const addedAt = (t: BurndownTask) => (t.sprintAddedAt ? toDate(t.sprintAddedAt) : null);
  const doneAt = (t: BurndownTask) => (t.completedAt ? toDate(t.completedAt) : null);

  const committedTasks = input.tasks.filter((t) => {
    const a = addedAt(t);
    return a === null || a.getTime() <= start.getTime();
  });
  const addedTasks = input.tasks.filter((t) => !committedTasks.includes(t));
  const committed = committedTasks.reduce((sum, t) => sum + weight(t), 0);
  const scopeAdded = addedTasks.reduce((sum, t) => sum + weight(t), 0);
  const completed = input.tasks.reduce((sum, t) => sum + (t.status === "DONE" ? weight(t) : 0), 0);

  const closedAt = input.completedAt ? toDate(input.completedAt) : null;
  const horizon = closedAt && closedAt.getTime() < now.getTime() ? closedAt : now;

  const remainingAt = (cut: Date): number =>
    input.tasks.reduce((sum, t) => {
      const a = addedAt(t);
      if (a && a.getTime() > cut.getTime()) return sum; // todavía no estaba en el sprint
      const d = doneAt(t);
      if (d && d.getTime() <= cut.getTime()) return sum; // ya estaba hecho
      return sum + weight(t);
    }, 0);

  const points: BurndownPoint[] = [
    { label: "inicio", date: start.toISOString(), ideal: committed, remaining: committed },
  ];
  for (let k = 1; k <= dayCount; k++) {
    const day = new Date(startDay.getTime() + (k - 1) * DAY_MS);
    const cut = endOfDayUTC(day);
    const reached = cut.getTime() <= horizon.getTime() || formatDayUTC(day) === formatDayUTC(horizon);
    points.push({
      label: formatDayUTC(day),
      date: cut.toISOString(),
      ideal: Math.round(committed * ((dayCount - k) / dayCount) * 100) / 100,
      remaining: reached ? remainingAt(cut.getTime() > horizon.getTime() ? horizon : cut) : null,
    });
  }

  return { unit, committed, scopeAdded, completed, points };
}
