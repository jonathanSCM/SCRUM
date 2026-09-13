"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TaskRow from "@/components/TaskRow";
import BulkActionsBar from "@/components/BulkActionsBar";
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

export default function SprintTasksList({
  tasks,
  sprints,
}: {
  tasks: Task[];
  sprints: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const { selected, toggle, clear } = useTaskSelection();
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  useEffect(() => {
    fetch("/api/team-members")
      .then((res) => res.json())
      .then(setMembers)
      .catch(() => {});
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
      [...selected].map((id) => {
        const t = taskById.get(id);
        if (!t) return Promise.resolve();
        return fetch(`/api/projects/${t.projectId}/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority }),
        });
      })
    );
    setBulkBusy(false);
    clear();
    router.refresh();
  }

  return (
    <div className="space-y-4">
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
      <ul className="space-y-2.5">
        {tasks.map((task) => (
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
  );
}
