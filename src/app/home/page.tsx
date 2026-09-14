import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import { DONE_TYPE } from "@/lib/taskLabels";

function pct(done: number, total: number) {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

export default async function HomePage() {
  const session = await requireSession();

  const [projectCount, tasks, sprints] = await Promise.all([
    prisma.project.count(),
    prisma.task.findMany({ select: { type: true, dueDate: true, assigneeName: true } }),
    prisma.sprint.findMany({
      orderBy: { startDate: "asc" },
      include: { tasks: { select: { type: true } } },
    }),
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pending = tasks.filter((t) => t.type !== DONE_TYPE);
  const done = tasks.filter((t) => t.type === DONE_TYPE);
  const overdue = pending.filter((t) => t.dueDate && new Date(t.dueDate).getTime() < today.getTime());

  const activeSprint = sprints.find((s) => new Date(s.startDate) <= today && today <= new Date(s.endDate));
  const activeSprintPct = activeSprint
    ? pct(activeSprint.tasks.filter((t) => t.type === DONE_TYPE).length, activeSprint.tasks.length)
    : null;

  const recentSprints = sprints.slice(-6).map((s) => ({
    id: s.id,
    name: s.name,
    pct: pct(s.tasks.filter((t) => t.type === DONE_TYPE).length, s.tasks.length),
    total: s.tasks.length,
  }));

  const byAssignee = new Map<string, number>();
  for (const t of pending) {
    const key = t.assigneeName ?? "Sin encargado";
    byAssignee.set(key, (byAssignee.get(key) ?? 0) + 1);
  }
  const workload = [...byAssignee.entries()].sort((a, b) => b[1] - a[1]);

  const kpis = [
    { label: "Proyectos", value: projectCount },
    { label: "Tareas pendientes", value: pending.length },
    { label: "Completadas", value: done.length },
    { label: "Atrasadas", value: overdue.length, accent: overdue.length > 0 ? "text-danger" : undefined },
  ];

  return (
    <div>
      <Navbar userName={session.user.name ?? session.user.email ?? ""} isLead={session.user.role === "LEAD"} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-1 font-display text-3xl font-semibold tracking-tight text-ink">Inicio</h1>
        <p className="mb-7 text-sm text-ink-soft">El estado general de todos los proyectos, de un vistazo.</p>

        <div className="mb-7 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="border-2 border-line bg-card p-4 shadow-[6px_6px_0_var(--moss)]">
              <p className={`font-display text-3xl font-bold ${k.accent ?? "text-ink"}`}>{k.value}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">{k.label}</p>
            </div>
          ))}
        </div>

        <div className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="border-2 border-line bg-card p-4 shadow-[6px_6px_0_var(--moss)]">
            <h2 className="mb-3 font-display text-sm font-semibold text-ink">Sprint activo</h2>
            {activeSprint ? (
              <>
                <p className="text-sm font-semibold text-ink">{activeSprint.name}</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-3 w-full overflow-hidden bg-paper border border-line">
                    <div className="h-full bg-moss" style={{ width: `${activeSprintPct}%` }} />
                  </div>
                  <span className="shrink-0 text-xs text-ink-faint">{activeSprintPct}%</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-ink-faint">No hay un sprint corriendo ahora mismo.</p>
            )}
          </div>

          <div className="border-2 border-line bg-card p-4 shadow-[6px_6px_0_var(--moss)]">
            <h2 className="mb-3 font-display text-sm font-semibold text-ink">Carga por encargado</h2>
            {workload.length === 0 ? (
              <p className="text-sm text-ink-faint">No hay tareas pendientes.</p>
            ) : (
              <ul className="space-y-1.5">
                {workload.slice(0, 5).map(([name, count]) => (
                  <li key={name} className="flex items-center justify-between text-sm">
                    <span className="text-ink-soft">{name}</span>
                    <span className="font-mono font-semibold text-ink">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="border-2 border-line bg-card p-4 shadow-[6px_6px_0_var(--moss)]">
          <h2 className="mb-4 font-display text-sm font-semibold text-ink">Tendencia de los últimos sprints</h2>
          {recentSprints.length === 0 ? (
            <p className="text-sm text-ink-faint">Todavía no hay sprints para comparar.</p>
          ) : (
            <div className="flex items-end gap-4" style={{ height: "120px" }}>
              {recentSprints.map((s) => (
                <div key={s.id} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-xs font-semibold text-ink-faint">{s.pct}%</span>
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full border-2 border-line bg-moss"
                      style={{ height: `${Math.max(s.pct, 4)}%` }}
                    />
                  </div>
                  <span className="max-w-full truncate text-[11px] text-ink-faint" title={s.name}>
                    {s.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
