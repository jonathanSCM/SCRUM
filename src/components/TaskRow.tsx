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

function toDateInputValue(value: Date | string | null): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toISOString().slice(0, 10);
}

function isOverdue(value: Date | string | null): boolean {
  if (!value) return false;
  const d = typeof value === "string" ? new Date(value) : value;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

// Misma idea visual que TaskRow.tsx del panel interno: borde de color por
// tipo, punto de color de prioridad, tachado + check cuando está completada
// -- sin comentarios ni checklist, eso no forma parte de SCRUM ProShop.
export default function TaskRow({
  task,
  projectId,
  projectName,
  members,
  sprints,
  selected,
  onToggleSelect,
}: {
  task: Task;
  projectId: string;
  projectName?: string;
  members: { id: string; name: string }[];
  sprints: { id: string; name: string }[];
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const isDone = task.type === DONE_TYPE;
  const typeColor = TYPE_COLOR[task.type] ?? "#9a8f7a";
  const priorityColor = PRIORITY_COLOR[task.priority] ?? "#9a8f7a";
  const overdue = !isDone && isOverdue(task.dueDate);

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
      className={`flex flex-wrap items-start justify-between gap-4 border bg-card p-3.5 rounded-xl2 shadow-[6px_6px_0_var(--moss)] ${
        overdue ? "border-danger border-2" : isDone ? "border-line opacity-60" : "border-line border-l-4"
      }`}
      style={isDone || overdue ? undefined : { borderLeftColor: typeColor }}
    >
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={!!selected}
          onChange={() => onToggleSelect(task.id)}
          className="mt-1 h-4 w-4 shrink-0 accent-moss"
          aria-label={`Seleccionar "${task.title}"`}
        />
      )}
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
          {overdue && <span className="tag border-danger bg-danger-bg text-danger">Vencida</span>}
        </p>
        {task.description && <p className="mt-1 text-xs text-ink-soft">{task.description}</p>}
        <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-ink-faint">
          {projectName && <span className="font-semibold text-ink-soft">{projectName}</span>}
          {task.moduleName && <span>{task.moduleName}</span>}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <input
          type="date"
          value={toDateInputValue(task.dueDate)}
          disabled={busy}
          onChange={(e) => patch({ dueDate: e.target.value || null })}
          className={`field !w-auto py-1 text-xs ${overdue ? "border-danger text-danger" : ""}`}
          title="Fecha límite"
        />

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
