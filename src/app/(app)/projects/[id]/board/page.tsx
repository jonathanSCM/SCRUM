import Link from "next/link";
import { requireSession } from "@/lib/session";
import { getProjectIssues, getProjectOptions, getProjectOrNotFound, getProjectSprints } from "@/lib/projectData";
import EmptyState from "@/components/ui/EmptyState";
import BoardView from "./BoardView";

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const project = await getProjectOrNotFound(id);
  const sprints = await getProjectSprints(id);
  const active = sprints.find((s) => s.state === "ACTIVE") ?? null;

  if (!active) {
    const planned = sprints.filter((s) => s.state === "PLANNED").length;
    return (
      <EmptyState
        title="No hay un sprint activo"
        hint={planned > 0 ? "Entrá al backlog, revisá los tickets del sprint planificado y tocá “Iniciar sprint”." : "Creá un sprint en el backlog, sumale tickets y arrancalo para verlo acá."}
        action={
          <Link href={`/projects/${id}/backlog`} className="btn-primary btn-sm">
            Ir al backlog
          </Link>
        }
      />
    );
  }

  const [issues, options] = await Promise.all([getProjectIssues(id, project.key, { sprintId: { in: [active.id] } }), getProjectOptions(id, project.key)]);
  const planned = sprints.filter((s) => s.state === "PLANNED").map((s) => ({ id: s.id, name: s.name }));

  return <BoardView projectId={id} sprint={active} issues={issues} options={options} currentUserId={session.user.id} plannedSprints={planned} />;
}
