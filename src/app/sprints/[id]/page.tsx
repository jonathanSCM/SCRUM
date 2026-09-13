import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import TaskSprintSelect from "@/components/TaskSprintSelect";
import { TYPE_LABEL, TYPE_COLOR, PRIORITY_LABEL, DONE_TYPE } from "@/lib/taskLabels";

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

  const done = sprint.tasks.filter((t) => t.type === DONE_TYPE).length;
  const total = sprint.tasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

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
              <div className="h-full bg-moss" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-ink-faint">
              {done}/{total} completadas ({pct}%)
            </span>
          </div>
        </div>

        {sprint.tasks.length === 0 ? (
          <p className="border border-dashed border-line-strong rounded-xl2 p-6 text-center text-sm text-ink-soft">
            Todavía no hay tareas asignadas a este sprint. Andá a un proyecto y asignale una.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {sprint.tasks.map((task) => {
              const isDone = task.type === DONE_TYPE;
              const typeColor = TYPE_COLOR[task.type] ?? "#9a8f7a";
              return (
                <li
                  key={task.id}
                  className={`flex items-start justify-between gap-4 border bg-card p-3.5 rounded-xl2 shadow-[6px_6px_0_var(--moss)] ${
                    isDone ? "border-line opacity-60" : "border-line border-l-4"
                  }`}
                  style={isDone ? undefined : { borderLeftColor: typeColor }}
                >
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium text-ink ${isDone ? "line-through" : ""}`}>{task.title}</p>
                    <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-ink-faint">
                      <span>{task.project.name}</span>
                      <span>· {TYPE_LABEL[task.type] ?? task.type}</span>
                      <span>· {PRIORITY_LABEL[task.priority] ?? task.priority}</span>
                      {task.assigneeName && <span>· {task.assigneeName}</span>}
                    </div>
                  </div>
                  <TaskSprintSelect taskId={task.id} currentSprintId={task.sprintId} sprints={sprints} />
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
