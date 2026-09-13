"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TaskRow from "@/components/TaskRow";
import BulkActionsBar from "@/components/BulkActionsBar";
import NewTaskForm from "./NewTaskForm";
import { DONE_TYPE } from "@/lib/taskLabels";
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
};

type Sprint = { id: string; name: string };
type Member = { id: string; name: string };

function splitDone(tasks: Task[]) {
  return {
    pending: tasks.filter((t) => t.type !== DONE_TYPE),
    done: tasks.filter((t) => t.type === DONE_TYPE),
  };
}

function TaskGroupList({
  tasks,
  projectId,
  members,
  sprints,
  selected,
  onToggleSelect,
}: {
  tasks: Task[];
  projectId: string;
  members: Member[];
  sprints: Sprint[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  const { pending, done } = splitDone(tasks);
  return (
    <>
      <ul className="space-y-2.5">
        {pending.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            projectId={projectId}
            members={members}
            sprints={sprints}
            selected={selected.has(task.id)}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </ul>
      {done.length > 0 && (
        <div className="mt-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Completadas ({done.length})
          </h4>
          <ul className="space-y-2.5">
            {done.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                projectId={projectId}
                members={members}
                sprints={sprints}
                selected={selected.has(task.id)}
                onToggleSelect={onToggleSelect}
              />
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

export default function TasksTab({
  projectId,
  tasks,
  sprints,
}: {
  projectId: string;
  tasks: Task[];
  sprints: Sprint[];
}) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const { selected, toggle, clear } = useTaskSelection();

  useEffect(() => {
    fetch("/api/team-members")
      .then((res) => res.json())
      .then(setMembers)
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "n" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setNewTaskOpen(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  async function applySprintToSelected(sprintId: string | null) {
    setBulkBusy(true);
    await Promise.all(
      [...selected].map((id) =>
        fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sprintId }),
        })
      )
    );
    setBulkBusy(false);
    clear();
    router.refresh();
  }

  async function applyPriorityToSelected(priority: string) {
    setBulkBusy(true);
    await Promise.all(
      [...selected].map((id) =>
        fetch(`/api/projects/${projectId}/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority }),
        })
      )
    );
    setBulkBusy(false);
    clear();
    router.refresh();
  }

  const bySprint = new Map<string, Task[]>();
  const withoutSprint: Task[] = [];
  for (const task of tasks) {
    if (task.sprintId) {
      const list = bySprint.get(task.sprintId) ?? [];
      list.push(task);
      bySprint.set(task.sprintId, list);
    } else {
      withoutSprint.push(task);
    }
  }

  const groups = sprints
    .map((sprint) => ({ sprint, tasks: bySprint.get(sprint.id) ?? [] }))
    .filter((g) => g.tasks.length > 0);

  return (
    <div className="space-y-6">
      <NewTaskForm projectId={projectId} members={members} open={newTaskOpen} onOpenChange={setNewTaskOpen} />

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

      {tasks.length === 0 ? (
        <p className="border border-dashed border-line-strong rounded-xl2 p-6 text-center text-sm text-ink-soft">
          Todavía no hay tareas para este proyecto.
        </p>
      ) : (
        <>
          {groups.map(({ sprint, tasks: sprintTasks }) => (
            <div key={sprint.id}>
              <h3 className="mb-2 font-display text-sm font-semibold text-ink">{sprint.name}</h3>
              <TaskGroupList
                tasks={sprintTasks}
                projectId={projectId}
                members={members}
                sprints={sprints}
                selected={selected}
                onToggleSelect={toggle}
              />
            </div>
          ))}

          {withoutSprint.length > 0 && (
            <div>
              {groups.length > 0 && <h3 className="mb-2 font-display text-sm font-semibold text-ink-soft">Sin sprint</h3>}
              <TaskGroupList
                tasks={withoutSprint}
                projectId={projectId}
                members={members}
                sprints={sprints}
                selected={selected}
                onToggleSelect={toggle}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
