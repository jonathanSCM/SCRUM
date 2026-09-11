import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import TaskSprintSelect from "@/components/TaskSprintSelect";
import { TYPE_LABEL, TYPE_COLOR, PRIORITY_LABEL, DONE_TYPE } from "@/lib/taskLabels";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const [project, sprints] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: { status: true, tasks: { orderBy: { updatedAt: "desc" } } },
    }),
    prisma.sprint.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
  ]);

  if (!project) notFound();

  const pending = project.tasks.filter((t) => t.type !== DONE_TYPE);
  const done = project.tasks.filter((t) => t.type === DONE_TYPE);

  return (
    <div>
      <Navbar userName={session.user.name ?? session.user.email ?? ""} isLead={session.user.role === "LEAD"} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-7 flex items-start justify-between border-b border-line pb-6">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">{project.name}</h1>
            {project.description && <p className="mt-2 max-w-2xl text-sm text-ink-soft">{project.description}</p>}
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              {project.deployUrl && (
                <a href={project.deployUrl} target="_blank" rel="noreferrer" className="font-semibold text-moss hover:underline">
                  ↗ Ver despliegue
                </a>
              )}
              {project.repoUrl && (
                <a href={project.repoUrl} target="_blank" rel="noreferrer" className="text-ink-soft hover:text-ink">
                  {project.repoUrl}
                </a>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="tag text-[#12081f]" style={{ backgroundColor: project.status.color }}>
              {project.status.name}
            </span>
            <span className="text-xs text-ink-faint">Encargado: {project.assigneeName ?? "sin asignar"}</span>
          </div>
        </div>

        <h2 className="mb-3 font-display text-lg font-semibold text-ink">Tareas</h2>
        {project.tasks.length === 0 ? (
          <p className="border border-dashed border-line-strong rounded-xl2 p-6 text-center text-sm text-ink-soft">
            Todavía no hay tareas sincronizadas para este proyecto.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {pending.map((task) => (
              <TaskRow key={task.id} task={task} sprints={sprints} />
            ))}
          </ul>
        )}

        {done.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Completadas ({done.length})
            </h3>
            <ul className="space-y-2.5">
              {done.map((task) => (
                <TaskRow key={task.id} task={task} sprints={sprints} done />
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}

function TaskRow({
  task,
  sprints,
  done,
}: {
  task: {
    id: string;
    title: string;
    description: string;
    type: string;
    priority: string;
    dueDate: Date | null;
    assigneeName: string | null;
    moduleName: string | null;
    sprintId: string | null;
  };
  sprints: { id: string; name: string }[];
  done?: boolean;
}) {
  const typeColor = TYPE_COLOR[task.type] ?? "#9a8f7a";
  return (
    <li
      className={`flex items-start justify-between gap-4 border bg-card p-3.5 rounded-xl2 backdrop-blur-md shadow-[0_20px_45px_-20px_rgba(0,0,0,0.7)] ${
        done ? "border-line opacity-60" : "border-line border-l-4"
      }`}
      style={done ? undefined : { borderLeftColor: typeColor }}
    >
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium text-ink ${done ? "line-through" : ""}`}>{task.title}</p>
        {task.description && <p className="mt-1 text-xs text-ink-soft">{task.description}</p>}
        <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-ink-faint">
          <span>{TYPE_LABEL[task.type] ?? task.type}</span>
          <span>· {PRIORITY_LABEL[task.priority] ?? task.priority}</span>
          {task.moduleName && <span>· {task.moduleName}</span>}
          {task.assigneeName && <span>· {task.assigneeName}</span>}
          {task.dueDate && <span>· vence {new Date(task.dueDate).toLocaleDateString("es-AR")}</span>}
        </div>
      </div>
      <TaskSprintSelect taskId={task.id} currentSprintId={task.sprintId} sprints={sprints} />
    </li>
  );
}
