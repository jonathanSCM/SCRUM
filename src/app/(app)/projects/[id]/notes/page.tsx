import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getProjectOrNotFound } from "@/lib/projectData";
import NotesView, { type NoteRow } from "./NotesView";

export const metadata = { title: "Notas" };

export default async function NotesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const project = await getProjectOrNotFound(id);

  const notes = await prisma.note.findMany({
    where: { projectId: id },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    include: { author: { select: { id: true, name: true } } },
  });

  const rows: NoteRow[] = notes.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    kind: n.kind,
    pinned: n.pinned,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
    author: n.author,
  }));

  return <NotesView projectId={id} notes={rows} currentUserId={session.user.id} isLead={project.access.isLead} />;
}
