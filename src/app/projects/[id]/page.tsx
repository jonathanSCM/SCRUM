import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import ProjectTabs from "./ProjectTabs";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const [project, sprints, statuses] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        status: true,
        tasks: { orderBy: { updatedAt: "desc" } },
        documents: { orderBy: { uploadedAt: "desc" } },
        history: { orderBy: { changedAt: "desc" }, take: 50 },
      },
    }),
    prisma.sprint.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
    prisma.statusOption.findMany({ orderBy: { order: "asc" } }),
  ]);

  if (!project) notFound();

  return (
    <div>
      <Navbar userName={session.user.name ?? session.user.email ?? ""} isLead={session.user.role === "LEAD"} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-7 flex items-start justify-between border-b border-line pb-6">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">{project.name}</h1>
            {project.description && <p className="mt-2 max-w-2xl text-sm text-ink-soft">{project.description}</p>}
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              {project.deployUrl && (
                <a href={project.deployUrl} target="_blank" rel="noreferrer" className="font-semibold text-moss hover:underline">
                  ↗ Ver despliegue
                </a>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="tag text-[#12081f]" style={{ backgroundColor: project.status.color }}>
              {project.status.name}
            </span>
            <span className="text-xs text-ink-faint">Encargado: {project.assigneeName ?? "sin asignar"}</span>
          </div>
        </div>

        <ProjectTabs
          projectId={project.id}
          tasks={project.tasks}
          sprints={sprints}
          statuses={statuses}
          statusId={project.statusId}
          assigneeId={project.assigneeId}
          description={project.description}
          deployUrl={project.deployUrl}
          stack={project.stack}
          documents={project.documents}
          history={project.history}
        />
      </main>
    </div>
  );
}
