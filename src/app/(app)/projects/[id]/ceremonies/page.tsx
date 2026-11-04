import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getProjectOrNotFound, getProjectSprints } from "@/lib/projectData";
import { formatIssueKey } from "@/lib/scrum/issueKey";
import { summarizeReview } from "@/lib/scrum/ceremonies";
import CeremoniesView from "./CeremoniesView";

export default async function CeremoniesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; sprint?: string }> }) {
  const { id } = await params;
  const { tab, sprint: sprintParam } = await searchParams;
  const session = await requireSession();
  const project = await getProjectOrNotFound(id);
  const sprints = await getProjectSprints(id);

  // Sprint por defecto: el activo; si no hay, el último completado; si no, el último.
  const selected =
    sprints.find((s) => s.id === sprintParam) ??
    sprints.find((s) => s.state === "ACTIVE") ??
    [...sprints].reverse().find((s) => s.state === "COMPLETED") ??
    sprints[sprints.length - 1] ??
    null;

  const [retro, actas, contacts, tasks] = await Promise.all([
    selected ? prisma.retroItem.findMany({ where: { projectId: id, sprintId: selected.id }, orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true } } } }) : [],
    prisma.note.findMany({
      where: { projectId: id, kind: { in: ["PLANNING", "REVIEW"] } },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { author: { select: { name: true } } },
    }),
    prisma.projectContact.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" } }),
    selected ? prisma.task.findMany({ where: { sprintId: selected.id, issueType: { not: "EPIC" } }, select: { number: true, title: true, status: true, storyPoints: true } }) : [],
  ]);

  const review = summarizeReview(tasks.map((t) => ({ key: formatIssueKey(project.key, t.number), title: t.title, status: t.status, points: t.storyPoints })));

  return (
    <CeremoniesView
      projectId={id}
      initialTab={tab ?? "daily"}
      sprints={sprints.map((s) => ({ id: s.id, name: s.name, state: s.state }))}
      selectedSprintId={selected?.id ?? null}
      currentUserId={session.user.id}
      isLead={session.user.role === "LEAD"}
      review={review}
      retro={retro.map((r) => ({ id: r.id, column: r.column, body: r.body, ticketKey: r.ticketKey, author: r.author }))}
      actas={actas.map((n) => ({ id: n.id, title: n.title, body: n.body, kind: n.kind, createdAt: n.createdAt.toISOString(), author: n.author?.name ?? null }))}
      contacts={contacts.map((c) => ({ id: c.id, name: c.name, role: c.role, contact: c.contact, notes: c.notes }))}
    />
  );
}
