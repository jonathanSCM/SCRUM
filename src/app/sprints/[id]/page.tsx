import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import SprintTasksList from "./SprintTasksList";
import { DONE_TYPE } from "@/lib/taskLabels";

function pct(done: number, total: number) {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

export default async function SprintDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const [sprint, sprints] = await Promise.all([
    prisma.sprint.findUnique({
      where: { id },
      include: { tasks: { include: { project: { select: { id: true, name: true } } }, orderBy: { updatedAt: "desc" } } },
    }),
    prisma.sprint.findMany({ select: { id: true, name: true }, orderBy: { startDate: "desc" } }),
  ]);

  if (!sprint) notFound();

  const previousSprint = await prisma.sprint.findFirst({
    where: { startDate: { lt: sprint.startDate } },
    orderBy: { startDate: "desc" },
    include: { tasks: { select: { type: true } } },
  });

  const done = sprint.tasks.filter((t) => t.type === DONE_TYPE).length;
  const total = sprint.tasks.length;
  const currentPct = pct(done, total);

  const previousPct = previousSprint
    ? pct(previousSprint.tasks.filter((t) => t.type === DONE_TYPE).length, previousSprint.tasks.length)
    : null;

  const overdueCount = sprint.tasks.filter((t) => {
    if (t.type === DONE_TYPE || !t.dueDate) return false;
    return new Date(t.dueDate).getTime() < new Date().setHours(0, 0, 0, 0);
  }).length;

  const byAssignee = new Map<string, { done: number; total: number }>();
  for (const t of sprint.tasks) {
    const key = t.assigneeName ?? "Sin encargar";
    const entry = byAssignee.get(key) ?? { done: 0, total: 0 };
    entry.total += 1;
    if (t.type === DONE_TYPE) entry.done += 1;
    byAssignee.set(key, entry);
  }

  return (
    <div>
      <Navbar userName={session.user.name ?? session.user.email ?? ""} isLead={session.user.role === "LEAD"} />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-7 border-b border-line pb-6">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">{sprint.name}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {new Date(sprint.startDate).toLocaleDateString("es-AR")} —{" "}
            {new Date(sprint.endDate).toLocaleDateString("es-AR")}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-3.5 w-64 overflow-hidden bg-paper border-2 border-line">
              <div className="h-full bg-moss" style={{ width: `${currentPct}%` }} />
            </div>
            <span className="text-xs text-ink-faint">
              {done}/{total} completadas ({currentPct}%)
            </span>
            {previousPct !== null && (
              <span className={`text-xs font-semibold ${currentPct >= previousPct ? "text-moss" : "text-danger"}`}>
                {currentPct >= previousPct ? "▲" : "▼"} {Math.abs(currentPct - previousPct)} pts vs {previousSprint!.name}
              </span>
            )}
          </div>
          {overdueCount > 0 && (
            <p className="mt-2 text-xs font-semibold text-danger">
              {overdueCount} {overdueCount === 1 ? "tarea vencida" : "tareas vencidas"}
            </p>
          )}
        </div>

        {sprint.tasks.length > 0 && (
          <div className="mb-7 border-2 border-line bg-card p-4 shadow-[6px_6px_0_var(--moss)]">
            <h2 className="mb-3 font-display text-sm font-semibold text-ink">Por encargado</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[...byAssignee.entries()].map(([name, s]) => (
                <div key={name}>
                  <p className="text-xs font-semibold text-ink">{name}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-2 w-full overflow-hidden bg-paper border border-line">
                      <div className="h-full bg-moss" style={{ width: `${pct(s.done, s.total)}%` }} />
                    </div>
                    <span className="shrink-0 text-[11px] text-ink-faint">
                      {s.done}/{s.total}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {sprint.tasks.length === 0 ? (
          <p className="border border-dashed border-line-strong p-6 text-center text-sm text-ink-soft">
            Todavía no hay tareas asignadas a este sprint. Andá a un proyecto y asignale una.
          </p>
        ) : (
          <SprintTasksList tasks={sprint.tasks} sprints={sprints} />
        )}
      </main>
    </div>
  );
}
