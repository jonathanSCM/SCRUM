import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import SprintsManager from "./SprintsManager";
import { DONE_TYPE } from "@/lib/taskLabels";

export default async function SprintsPage() {
  const session = await requireSession();

  const sprints = await prisma.sprint.findMany({
    include: { tasks: { select: { type: true } } },
    orderBy: { startDate: "desc" },
  });

  const withProgress = sprints.map((s) => ({
    id: s.id,
    name: s.name,
    startDate: s.startDate.toISOString(),
    endDate: s.endDate.toISOString(),
    total: s.tasks.length,
    done: s.tasks.filter((t) => t.type === DONE_TYPE).length,
  }));

  return (
    <div>
      <Navbar userName={session.user.name ?? session.user.email ?? ""} isLead={session.user.role === "LEAD"} />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-1 font-display text-3xl font-semibold tracking-tight text-ink">Sprints</h1>
        <p className="mb-7 text-sm text-ink-soft">
          Organizá las tareas en ciclos con fecha.
        </p>
        <SprintsManager initialSprints={withProgress} />
      </main>
    </div>
  );
}
