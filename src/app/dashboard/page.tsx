import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await requireSession();

  const [statuses, projects] = await Promise.all([
    prisma.statusOption.findMany({ orderBy: { order: "asc" } }),
    prisma.project.findMany({
      include: { status: true, _count: { select: { tasks: true } } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const byStatus = new Map<string, typeof projects>();
  for (const p of projects) {
    const list = byStatus.get(p.statusId) ?? [];
    list.push(p);
    byStatus.set(p.statusId, list);
  }

  return (
    <div>
      <Navbar userName={session.user.name ?? session.user.email ?? ""} isLead={session.user.role === "LEAD"} />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="mb-1 font-display text-3xl font-semibold tracking-tight text-ink">Proyectos</h1>
        <p className="mb-7 text-sm text-ink-soft">
          Vista de proceso de todos los proyectos — se actualiza sola desde el panel interno.
        </p>

        {statuses.length === 0 ? (
          <p className="border border-dashed border-line-strong p-6 text-center text-sm text-ink-soft">
            Todavía no llegó ningún dato sincronizado.
          </p>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {statuses.map((status) => {
              const list = byStatus.get(status.id) ?? [];
              return (
                <div key={status.id} className="w-72 shrink-0">
                  <div className="mb-3 flex items-center gap-2 border-b-2 pb-2" style={{ borderColor: status.color }}>
                    <h2 className="font-display text-sm font-semibold text-ink">{status.name}</h2>
                    <span className="text-xs text-ink-faint">{list.length}</span>
                  </div>
                  <div className="space-y-2.5">
                    {list.length === 0 ? (
                      <div className="border border-dashed border-line-strong p-4 text-center text-xs text-ink-faint">
                        Sin proyectos
                      </div>
                    ) : (
                      list.map((p) => (
                        <Link
                          key={p.id}
                          href={`/projects/${p.id}`}
                          className="block border border-line bg-card p-3.5 shadow-[2px_2px_0_var(--line)] transition-transform hover:-translate-y-0.5"
                        >
                          <p className="font-display text-sm font-semibold text-ink">{p.name}</p>
                          {p.description && (
                            <p className="mt-1 line-clamp-2 text-xs text-ink-soft">{p.description}</p>
                          )}
                          <div className="mt-2 flex items-center justify-between text-xs text-ink-faint">
                            <span>{p.assigneeName ?? "Sin encargado"}</span>
                            <span>{p._count.tasks} tareas</span>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
