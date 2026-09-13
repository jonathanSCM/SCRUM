import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import MyWeekView from "./MyWeekView";

export default async function MyWeekPage() {
  const session = await requireSession();

  const [tasks, sprints] = await Promise.all([
    prisma.task.findMany({
      include: { project: { select: { id: true, name: true } } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.sprint.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div>
      <Navbar userName={session.user.name ?? session.user.email ?? ""} isLead={session.user.role === "LEAD"} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-1 font-display text-3xl font-semibold tracking-tight text-ink">Mi semana</h1>
        <p className="mb-7 text-sm text-ink-soft">
          Todas las tareas de todos los proyectos, organizadas por lo que vence y filtrables por encargado, prioridad
          y sprint.
        </p>
        <MyWeekView tasks={tasks} sprints={sprints} />
      </main>
    </div>
  );
}
