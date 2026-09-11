import TaskSprintSelect from "./TaskSprintSelect";
import { TYPE_LABEL, TYPE_COLOR, PRIORITY_LABEL, PRIORITY_COLOR, DONE_TYPE } from "@/lib/taskLabels";

type Task = {
  id: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  dueDate: Date | string | null;
  assigneeName: string | null;
  moduleName: string | null;
  sprintId: string | null;
};

// Misma idea visual que TaskRow.tsx del panel interno: borde de color por
// tipo, punto de color de prioridad, tachado + check cuando está completada
// -- sin comentarios ni checklist, eso no forma parte de SCRUM ProShop.
export default function TaskRow({ task, sprints }: { task: Task; sprints: { id: string; name: string }[] }) {
  const isDone = task.type === DONE_TYPE;
  const typeColor = TYPE_COLOR[task.type] ?? "#9a8f7a";
  const priorityColor = PRIORITY_COLOR[task.priority] ?? "#9a8f7a";

  return (
    <li
      className={`flex items-start justify-between gap-4 border bg-card p-3.5 rounded-xl2 backdrop-blur-md shadow-[0_20px_45px_-20px_rgba(0,0,0,0.7)] ${
        isDone ? "border-line opacity-60" : "border-line border-l-4"
      }`}
      style={isDone ? undefined : { borderLeftColor: typeColor }}
    >
      <div className="min-w-0 flex-1">
        <p className={`flex items-start gap-2 text-sm font-medium ${isDone ? "text-ink-faint line-through" : "text-ink"}`}>
          {isDone ? (
            <span className="mt-0.5 shrink-0 text-moss" title="Completada">
              ✓
            </span>
          ) : (
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: priorityColor }}
              title={`Prioridad: ${PRIORITY_LABEL[task.priority] ?? task.priority}`}
            />
          )}
          {task.title}
        </p>
        {task.description && <p className="mt-1 text-xs text-ink-soft">{task.description}</p>}
        <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-ink-faint">
          <span>{TYPE_LABEL[task.type] ?? task.type}</span>
          {task.moduleName && <span>· {task.moduleName}</span>}
          {task.assigneeName && <span>· {task.assigneeName}</span>}
          {task.dueDate && <span>· vence {new Date(task.dueDate).toLocaleDateString("es-AR")}</span>}
        </div>
      </div>
      <TaskSprintSelect taskId={task.id} currentSprintId={task.sprintId} sprints={sprints} />
    </li>
  );
}
