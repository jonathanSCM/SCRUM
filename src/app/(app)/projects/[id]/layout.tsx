import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getProjectOrNotFound } from "@/lib/projectData";
import { daysRemaining } from "@/lib/scrum/sprintLifecycle";
import { listProjectMembers } from "@/lib/projectMembers";
import { parseLabels } from "@/lib/scrum/labels";
import Avatar from "@/components/ui/Avatar";
import ProjectTabs from "./ProjectTabs";
import WorkspaceSync from "./WorkspaceSync";
import { activeAccess } from "@/lib/workspace";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectOrNotFound(id);
  const activeSprint = await prisma.sprint.findFirst({ where: { projectId: id, state: "ACTIVE" }, select: { name: true, endDate: true } });
  const active = await activeAccess(project.access.session.user.id);
  const wrongTeam = project.workspaceId && active?.workspaceId !== project.workspaceId;
  const members = await listProjectMembers(id);
  const left = activeSprint ? daysRemaining(activeSprint.endDate) : null;

  const isGroup = project.kind === "GROUP";
  const convertedTo = project.convertedToId ? await prisma.project.findUnique({ where: { id: project.convertedToId }, select: { id: true, name: true } }) : null;

  if (isGroup) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 pb-16 pt-6 sm:px-6">
        <div className="mb-1 text-xs text-ink-faint">
          <Link href="/groups" className="hover:text-ink">Grupos de tareas</Link> {project.key && <><span className="px-1">/</span> <span className="font-mono">{project.key}</span></>}
        </div>
        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{project.name}</h1>
          <span className="lozenge text-ink-soft">Grupo de tareas</span>
          {project.isPrivate && <span className="lozenge text-warn" title="Solo lo ven quien lo creó y las personas con acceso">🔒 Privado</span>}
          {project.archivedAt && <span className="lozenge text-ink-faint">Archivado</span>}
          {members.length > 0 && (
            <div className="flex items-center -space-x-1.5" title={`Con acceso: ${members.map((m) => m.name).join(", ")}`}>
              {members.slice(0, 6).map((m) => <Avatar key={m.id} name={m.name} userId={m.id} size={22} />)}
            </div>
          )}
        </div>
        {convertedTo && (
          <p className="mb-4 rounded-lg border border-line bg-card-2 px-4 py-3 text-sm text-ink-soft">
            Este grupo se archivó porque se convirtió en el proyecto <Link href={`/projects/${convertedTo.id}/board`} className="font-semibold text-rust hover:underline">{convertedTo.name}</Link>. Sus tareas están allí.
          </p>
        )}
        {wrongTeam && project.workspaceId && <WorkspaceSync workspaceId={project.workspaceId} />}
        <ProjectTabs projectId={id} group />
        <div className="pt-6">{children}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 pb-16 pt-6 sm:px-6">
      <div className="mb-1 text-xs text-ink-faint">
        <Link href="/projects" className="hover:text-ink">Proyectos</Link> <span className="px-1">/</span> <span className="font-mono">{project.key}</span>
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{project.name}</h1>
        <span className="tag border" style={{ background: `${project.status.color}22`, borderColor: `${project.status.color}77`, color: `color-mix(in srgb, ${project.status.color} 55%, var(--ink))` }}>
          {project.status.name}
        </span>
        {parseLabels(project.labels).map((l) => <span key={l} className="lozenge text-ink-soft">{l}</span>)}
        <div className="flex items-center gap-2 text-xs text-ink-faint" title="Encargado del proyecto">
          <Avatar name={project.lead?.name} userId={project.lead?.id} size={22} />
          {project.lead?.name ?? "Sin encargado"}
        </div>
        {members.length > 0 && (
          <div className="flex items-center -space-x-1.5" title={`Equipo del proyecto: ${members.map((m) => m.name).join(", ")}`}>
            {members.slice(0, 6).map((m) => <Avatar key={m.id} name={m.name} userId={m.id} size={22} />)}
            {members.length > 6 && <span className="pl-2.5 text-xs text-ink-faint">+{members.length - 6}</span>}
          </div>
        )}
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
      {wrongTeam && project.workspaceId && <WorkspaceSync workspaceId={project.workspaceId} />}
      <ProjectTabs projectId={id} />
      <div className="pt-6">{children}</div>
    </div>
  );
}
