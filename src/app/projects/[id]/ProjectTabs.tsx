"use client";

import { useState } from "react";
import TasksTab from "./TasksTab";
import OverviewTab from "./OverviewTab";
import DocumentsTab from "./DocumentsTab";
import HistoryTab from "./HistoryTab";

const TABS = ["Tareas", "Info del proyecto", "Documentos", "Historial"] as const;

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

export default function ProjectTabs({
  projectId,
  tasks,
  sprints,
  statuses,
  statusId,
  assigneeId,
  description,
  deployUrl,
  stack,
  documents,
  history,
}: {
  projectId: string;
  tasks: Task[];
  sprints: { id: string; name: string }[];
  statuses: { id: string; name: string; color: string }[];
  statusId: string;
  assigneeId: string | null;
  description: string;
  deployUrl: string | null;
  stack: string;
  documents: { id: string; filename: string; docType: string; uploadedAt: Date | string }[];
  history: {
    id: string;
    field: string;
    oldValue: string | null;
    newValue: string | null;
    changedAt: Date | string;
    changedByName: string | null;
    taskTitle: string | null;
  }[];
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Tareas");

  return (
    <div>
      <div className="mb-7 flex gap-6 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 pb-2.5 text-sm font-medium transition-colors ${
              tab === t ? "border-moss text-ink" : "border-transparent text-ink-faint hover:text-ink-soft"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Tareas" && <TasksTab tasks={tasks} sprints={sprints} />}
      {tab === "Info del proyecto" && (
        <OverviewTab
          projectId={projectId}
          statusId={statusId}
          assigneeId={assigneeId}
          description={description}
          deployUrl={deployUrl}
          stack={stack}
          statuses={statuses}
        />
      )}
      {tab === "Documentos" && <DocumentsTab projectId={projectId} documents={documents} />}
      {tab === "Historial" && <HistoryTab entries={history} />}
    </div>
  );
}
