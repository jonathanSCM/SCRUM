"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TaskRow from "@/components/TaskRow";
import BulkActionsBar from "@/components/BulkActionsBar";
import { PRIORITY_LABEL, DONE_TYPE } from "@/lib/taskLabels";
import { useTaskSelection } from "@/lib/useTaskSelection";

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
  projectId: string;
  project: { id: string; name: string };
};

type Sprint = { id: string; name: string };
type Member = { id: string; name: string };

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysFromNow(value: Date | string | null): number | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  const diffMs = d.getTime() - startOfToday().getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export default function MyWeekView({ tasks, sprints }: { tasks: Task[]; sprints: Sprint[] }) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState("");
  const [sprintId, setSprintId] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const { selected, toggle, clear } = useTaskSelection();
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  async function applySprintToSelected(newSprintId: string | null) {
    setBulkBusy(true);
    await Promise.all(
      [...selected].map((id) =>
        fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sprintId: newSprintId }),
        })
      )
    );
    setBulkBusy(false);
    clear();
    router.refresh();
  }

  async function applyPriorityToSelected(newPriority: string) {
    setBulkBusy(true);
    await Promise.all(
      [...selected].map((id) => {
        const t = taskById.get(id);
        if (!t) return Promise.resolve();
        return fetch(`/api/projects/${t.projectId}/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority: newPriority }),
        });
      })
    );
    setBulkBusy(false);
    clear();
    router.refresh();
  }

  useEffect(() => {
    fetch("/api/team-members")
      .then((res) => res.json())
      .then(setMembers)
      .catch(() => {});
  }, []);

  const assignedNames = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of tasks) {
      if (t.assigneeId && t.assigneeName) seen.set(t.assigneeId, t.assigneeName);
    }
    return seen;
  }, [tasks]);

  const filtered = tasks.filter((t) => {
    if (assigneeId && t.assigneeId !== assigneeId) return false;
    if (priority && t.priority !== priority) return false;
    if (sprintId === "__none__" && t.sprintId) return false;
    if (sprintId && sprintId !== "__none__" && t.sprintId !== sprintId) return false;
    return true;
  });

  const done = filtered.filter((t) => t.type === DONE_TYPE);
  const pending = filtered.filter((t) => t.type !== DONE_TYPE);

  const overdue = pending.filter((t) => (daysFromNow(t.dueDate) ?? Infinity) < 0);
  const thisWeek = pending.filter((t) => {
    const d = daysFromNow(t.dueDate);
    return d !== null && d >= 0 && d < 7;
  });
  const later = pending.filter((t) => (daysFromNow(t.dueDate) ?? -Infinity) >= 7);
  const noDate = pending.filter((t) => t.dueDate === null);

  const groups: { title: string; tasks: Task[]; accent?: string }[] = [
    { title: `Atrasadas (${overdue.length})`, tasks: overdue, accent: "text-danger" },
    { title: `Esta semana (${thisWeek.length})`, tasks: thisWeek, accent: "text-moss" },
    { title: `Más adelante (${later.length})`, tasks: later },
    { title: `Sin fecha (${noDate.length})`, tasks: noDate },
  ];
  if (showDone) groups.push({ title: `Completadas (${done.length})`, tasks: done });

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end gap-3 border-2 border-line bg-card p-4 shadow-[6px_6px_0_var(--moss)]">
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Encargado</label>
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="field !w-auto">
            <option value="">Todos</option>
            {[...assignedNames.entries()].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
            {members
              .filter((m) => !assignedNames.has(m.id))
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Prioridad</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="field !w-auto">
            <option value="">Todas</option>
            {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Sprint</label>
          <select value={sprintId} onChange={(e) => setSprintId(e.target.value)} className="field !w-auto">
            <option value="">Todos</option>
            <option value="__none__">Sin sprint</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <label className="ml-auto flex items-center gap-2 pb-1.5 text-xs font-semibold text-ink-soft">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="accent-moss" />
          Mostrar completadas
        </label>
      </div>

      {selected.size > 0 && (
        <BulkActionsBar
          count={selected.size}
          sprints={sprints}
          busy={bulkBusy}
          onApplySprint={applySprintToSelected}
          onApplyPriority={applyPriorityToSelected}
          onClear={clear}
        />
      )}

      {filtered.length === 0 ? (
        <p className="border border-dashed border-line-strong p-6 text-center text-sm text-ink-soft">
          No hay tareas que coincidan con estos filtros.
        </p>
      ) : (
        groups
          .filter((g) => g.tasks.length > 0)
          .map((g) => (
            <div key={g.title}>
              <h3 className={`mb-2.5 font-display text-sm font-semibold ${g.accent ?? "text-ink"}`}>{g.title}</h3>
              <ul className="space-y-2.5">
                {g.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    projectId={task.projectId}
                    projectName={task.project.name}
                    members={members}
                    sprints={sprints}
                    selected={selected.has(task.id)}
                    onToggleSelect={toggle}
                  />
                ))}
              </ul>
            </div>
          ))
      )}
    </div>
  );
}
