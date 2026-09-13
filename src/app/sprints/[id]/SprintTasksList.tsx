"use client";

import { useEffect, useState } from "react";
import TaskRow from "@/components/TaskRow";

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
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/team-members")
      .then((res) => res.json())
      .then(setMembers)
      .catch(() => {});
  }, []);

  return (
    <ul className="space-y-2.5">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          projectId={task.projectId}
          projectName={task.project.name}
          members={members}
          sprints={sprints}
        />
      ))}
    </ul>
  );
}
