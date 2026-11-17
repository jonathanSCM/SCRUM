import { requireSession } from "@/lib/session";
import { getProjectIssues, getProjectOptions, getProjectOrNotFound, getProjectSprints } from "@/lib/projectData";
import type { SprintData } from "@/lib/types";
import BoardView from "./BoardView";

export const metadata = { title: "Tablero" };

export default async function BoardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ vista?: string }> }) {
  const { id } = await params;
  const { vista } = await searchParams;
  const session = await requireSession();
  const project = await getProjectOrNotFound(id);

  const sprints = await getProjectSprints(id);
  const active = sprints.find((s) => s.state === "ACTIVE") ?? null;
  const planned = sprints.filter((s) => s.state === "PLANNED").map((s) => ({ id: s.id, name: s.name }));

  // Sin sprint activo se muestran todas las tareas. Con sprint activo se puede elegir entre "Sprint activo" (por defecto) y "Todas las tareas".
  const allTasks = !active || vista === "todas";
  const [issues, options] = await Promise.all([
    getProjectIssues(id, project.key, allTasks ? {} : { sprintId: { in: [active!.id] } }),
    getProjectOptions(id, project.key),
  ]);
  const everything: SprintData = { id, name: "Todas las tareas", goal: "", state: "ACTIVE", startDate: null, endDate: null, startedAt: null, completedAt: null, committedPoints: 0, completedPoints: 0, committedCount: 0, completedCount: 0 };

  return (
    <BoardView
      projectId={id}
      sprint={allTasks ? everything : active!}
      issues={issues}
      options={options}
      currentUserId={session.user.id}
      plannedSprints={planned}
      allTasks={allTasks}
      activeSprint={active ? { id: active.id, name: active.name } : null}
    />
  );
}
