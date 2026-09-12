"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TaskSprintSelect from "./TaskSprintSelect";
import { TYPE_LABEL, TYPE_COLOR, PRIORITY_LABEL, PRIORITY_COLOR, DONE_TYPE } from "@/lib/taskLabels";

type Task = {
  id: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  dueDate: Date | string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  moduleName: string | null;
  sprintId: string | null;
};

const TYPE_OPTIONS = Object.entries(TYPE_LABEL);
const PRIORITY_OPTIONS = Object.entries(PRIORITY_LABEL);

// Misma idea visual que TaskRow.tsx del panel interno: borde de color por
// tipo, punto de color de prioridad, tachado + check cuando está completada
// -- sin comentarios ni checklist, eso no forma parte de SCRUM ProShop.
export default function TaskRow({
  task,
  projectId,
  members,
  sprints,
}: {
  task: Task;
  projectId: string;
  members: { id: string; name: string }[];
  sprints: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const isDone = task.type === DONE_TYPE;
  const typeColor = TYPE_COLOR[task.type] ?? "#9a8f7a";
  const priorityColor = PRIORITY_COLOR[task.priority] ?? "#9a8f7a";

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <li
      className={`flex flex-wrap items-start justify-between gap-4 border bg-card p-3.5 rounded-xl2 backdrop-blur-md shadow-[0_20px_45px_-20px_rgba(0,0,0,0.7)] ${
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
        {task.moduleName && <p className="mt-1 text-[11px] text-ink-faint">{task.moduleName}</p>}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <select
          value={task.priority}
          disabled={busy}
          onChange={(e) => patch({ priority: e.target.value })}
          className="field !w-auto py-1 text-xs"
          title="Prioridad"
        >
          {PRIORITY_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={task.type}
          disabled={busy}
          onChange={(e) => patch({ type: e.target.value })}
          className="field !w-auto py-1 text-xs font-semibold"
          style={{ color: typeColor, borderColor: typeColor }}
          title="Estado"
        >
          {TYPE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={task.assigneeId ?? ""}
          disabled={busy}
          onChange={(e) => patch({ assigneeId: e.target.value || null })}
          className={`field !w-auto py-1 text-xs ${task.assigneeId ? "font-semibold text-ink" : ""}`}
          title="Encargado"
        >
          <option value="">Sin encargado</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>

        <TaskSprintSelect taskId={task.id} currentSprintId={task.sprintId} sprints={sprints} />
      </div>
    </li>
  );
}
