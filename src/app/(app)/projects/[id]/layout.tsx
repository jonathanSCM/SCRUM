import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getProjectOrNotFound } from "@/lib/projectData";
import { daysRemaining } from "@/lib/scrum/sprintLifecycle";
import Avatar from "@/components/ui/Avatar";
import ProjectTabs from "./ProjectTabs";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectOrNotFound(id);
  const activeSprint = await prisma.sprint.findFirst({ where: { projectId: id, state: "ACTIVE" }, select: { name: true, endDate: true } });
  const left = activeSprint ? daysRemaining(activeSprint.endDate) : null;

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 pb-16 pt-6 sm:px-6">
      <div className="mb-1 text-xs text-ink-faint">
        <Link href="/projects" className="hover:text-ink">Proyectos</Link> <span className="px-1">/</span> <span className="font-mono">{project.key}</span>
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{project.name}</h1>
        <span className="tag border" style={{ background: `${project.status.color}22`, borderColor: `${project.status.color}77`, color: `color-mix(in srgb, ${project.status.color} 60%, #1b1730)` }}>
          {project.status.name}
        </span>
        <div className="flex items-center gap-2 text-xs text-ink-faint" title="Encargado del proyecto">
          <Avatar name={project.lead?.name} size={22} />
          {project.lead?.name ?? "Sin encargado"}
        </div>
        {activeSprint && (
          <span className="lozenge text-moss-ink">
            {activeSprint.name}
            {left !== null ? ` · ${left} d` : ""}
          </span>
        )}
        {project.deployUrl && (
          <a href={project.deployUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-moss-ink hover:underline">
            ↗ Ver despliegue
          </a>
        )}
      </div>
      <ProjectTabs projectId={id} />
      <div className="pt-6">{children}</div>
    </div>
  );
}
