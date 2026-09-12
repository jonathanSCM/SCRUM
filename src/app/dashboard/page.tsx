import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import ProjectsBoard from "./ProjectsBoard";

export default async function DashboardPage() {
  const session = await requireSession();

  const [statuses, projects] = await Promise.all([
    prisma.statusOption.findMany({ orderBy: { order: "asc" } }),
    prisma.project.findMany({
      include: { _count: { select: { tasks: true } } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return (
    <div>
      <Navbar userName={session.user.name ?? session.user.email ?? ""} isLead={session.user.role === "LEAD"} />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="mb-1 font-display text-3xl font-semibold tracking-tight text-ink">Proyectos</h1>
        <p className="mb-7 text-sm text-ink-soft">
          Arrastrá un proyecto entre columnas para actualizar su estado.
        </p>

        {statuses.length === 0 ? (
          <p className="border border-dashed border-line-strong rounded-xl2 p-6 text-center text-sm text-ink-soft">
            Todavía no hay proyectos.
          </p>
        ) : (
          <ProjectsBoard statuses={statuses} projects={projects} />
        )}
      </main>
    </div>
  );
}
