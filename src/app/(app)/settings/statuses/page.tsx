import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/session";
import { redirect } from "next/navigation";
import StatusesManager from "./StatusesManager";

export const metadata = { title: "Estados de proyecto" };

export default async function StatusesPage() {
  const ws = await requireWorkspace();
  if (!ws.isLead) redirect("/projects");
  const statuses = await prisma.statusOption.findMany({ where: { workspaceId: ws.workspaceId }, orderBy: { order: "asc" }, include: { _count: { select: { projects: true } } } });

  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <h1 className="mb-1 font-display text-3xl font-extrabold tracking-tight text-ink">Estados de proyecto</h1>
      <p className="mb-7 text-sm text-ink-soft">Las columnas del tablero de Proyectos (no confundir con el estado de cada ticket, que es fijo: Por hacer, En progreso, Bloqueadas, En revisión, Hecho).</p>
      <StatusesManager initial={statuses.map((s) => ({ id: s.id, name: s.name, color: s.color, projects: s._count.projects }))} />
    </main>
  );
}
