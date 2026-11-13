import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/session";
import { listCards } from "@/lib/libraryData";
import LibraryView from "./LibraryView";

export const metadata = { title: "Biblioteca" };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ tarjeta?: string }> }) {
  const ws = await requireWorkspace();
  const { tarjeta } = await searchParams;
  const [cards, projects] = await Promise.all([
    listCards(ws.workspaceId),
    prisma.project.findMany({ where: { workspaceId: ws.workspaceId, kind: "PROJECT" }, orderBy: { name: "asc" }, select: { id: true, name: true, key: true } }),
  ]);
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6">
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">Biblioteca</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Tarjetas con varios archivos y enlaces del equipo: la resolución de una reunión, un contrato, los entregables de un cliente… Cada tarjeta puede tener un tipo, etiquetas y un proyecto.
      </p>
      <LibraryView initial={cards} projects={projects} currentUserId={ws.session.user.id} isLead={ws.isLead} openCardId={tarjeta} />
    </main>
  );
}
