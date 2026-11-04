// Reglas del ciclo de vida de un sprint, sin acceso a la base (las rutas de la
// API las usan y las pruebas las cubren).

export type LifecycleTask = {
  id: string;
  status: string;
  storyPoints: number | null;
};

export type StartValidationInput = {
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  state: string;
  hasOtherActiveSprint: boolean;
};

export function validateStart(input: StartValidationInput): string | null {
  if (input.state !== "PLANNED") return "Solo se puede iniciar un sprint planificado";
  if (input.hasOtherActiveSprint) return "Ya hay un sprint activo en este proyecto: completalo antes de iniciar otro";
  if (!input.name.trim()) return "El sprint necesita un nombre";
  if (!input.startDate || !input.endDate) return "El sprint necesita fecha de inicio y de fin";
  if (input.endDate.getTime() <= input.startDate.getTime()) return "La fecha de fin tiene que ser posterior a la de inicio";
  return null;
}

export function durationToEnd(start: Date, weeks: number): Date {
  return new Date(start.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
}

function sumPoints(tasks: LifecycleTask[]): number {
  return tasks.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
}

// Foto de lo comprometido al iniciar el sprint.
export function snapshotOnStart(tasks: LifecycleTask[]) {
  return { committedPoints: sumPoints(tasks), committedCount: tasks.length };
}

export type CompletionPlan = {
  completedPoints: number;
  completedCount: number;
  unfinishedIds: string[];
  // Dónde va lo que no se terminó: otro sprint (id) o el backlog (null).
  destinationSprintId: string | null;
};

export function planCompletion(tasks: LifecycleTask[], destinationSprintId: string | null): CompletionPlan {
  const done = tasks.filter((t) => t.status === "DONE");
  const unfinished = tasks.filter((t) => t.status !== "DONE");
  return {
    completedPoints: sumPoints(done),
    completedCount: done.length,
    unfinishedIds: unfinished.map((t) => t.id),
    destinationSprintId,
  };
}

export function daysRemaining(endDate: Date | null, now: Date = new Date()): number | null {
  if (!endDate) return null;
  const ms = endDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

// Sacar un ticket de un sprint ACTIVO (al backlog o a otro sprint) cambia lo
// que el equipo se comprometió a entregar: solo lo puede hacer un líder.
export function validateLeaveActiveSprint(input: {
  currentSprintState: string | null;
  currentSprintId: string | null;
  nextSprintId: string | null;
  actorRole?: string;
}): string | null {
  if (input.currentSprintState !== "ACTIVE") return null;
  if (input.currentSprintId === input.nextSprintId) return null;
  if (input.actorRole === "LEAD") return null;
  return "Solo un líder puede sacar tickets de un sprint activo";
}
