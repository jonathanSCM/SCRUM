import "server-only";
import { messageVisibleTo } from "@/lib/chatChannels";
import { prisma } from "@/lib/prisma";
import { formatIssueKey } from "@/lib/scrum/issueKey";
import { categoryLabel } from "@/lib/scrum/library";
import { parseRefs, snippetOf, type RefKind } from "@/lib/scrum/chat";

// Lectura y armado de los mensajes del chat general, con las referencias
// resueltas (nombre actual, estado y enlace) para que el navegador solo dibuje.

export type ResolvedRef = {
  kind: RefKind;
  id: string;
  label: string;
  sub: string | null; // proyecto o estado, como texto secundario
  href: string | null;
  missing: boolean;
};

export type ChatMessageDTO = {
  id: string;
  body: string;
  level: "AYUDA" | "URGENTE" | null;
  announce: boolean;
  channel: string | null; // nombre del canal (solo se usa en la pestaña de avisos del equipo)
  createdAt: string;
  author: { id: string; name: string; color: string | null } | null;
  refs: ResolvedRef[];
  files: Array<{ id: string; filename: string; mimeType: string; size: number }>;
  updatedAt: string;
  replyTo: { id: string; author: string | null; snippet: string } | null;
  reactions: Array<{ emoji: string; count: number; users: string[]; userIds: string[] }>;
};

const messageInclude = {
  channel: { select: { name: true } },
  author: { select: { id: true, name: true, chatColor: true } },
  refs: true,
  files: { select: { id: true, filename: true, mimeType: true, size: true } },
  reactions: { orderBy: { createdAt: "asc" }, include: { user: { select: { id: true, name: true } } } },
  replyTo: { select: { id: true, body: true, deletedAt: true, author: { select: { name: true } }, _count: { select: { files: true } } } },
} as const;

export async function resolveRefs(refs: Array<{ kind: string; targetId: string }>, workspaceId: string): Promise<Map<string, ResolvedRef>> {
  const ids = (kind: string) => [...new Set(refs.filter((r) => r.kind === kind).map((r) => r.targetId))];
  const [projects, issues, sprints, users, cards] = await Promise.all([
    prisma.project.findMany({ where: { id: { in: ids("PROJECT") }, workspaceId }, select: { id: true, name: true, key: true } }),
    prisma.task.findMany({ where: { id: { in: ids("ISSUE") }, project: { workspaceId } }, select: { id: true, number: true, title: true, status: true, projectId: true, project: { select: { key: true } } } }),
    prisma.sprint.findMany({ where: { id: { in: ids("SPRINT") }, project: { workspaceId } }, select: { id: true, name: true, state: true, projectId: true, project: { select: { name: true } } } }),
    prisma.user.findMany({ where: { id: { in: ids("USER") }, memberships: { some: { workspaceId } } }, select: { id: true, name: true } }),
    prisma.fileCard.findMany({ where: { id: { in: ids("CARD") }, workspaceId }, select: { id: true, title: true, category: true, _count: { select: { items: true } } } }),
  ]);

  const out = new Map<string, ResolvedRef>();
  for (const p of projects) out.set(`PROJECT:${p.id}`, { kind: "project", id: p.id, label: p.name, sub: p.key, href: `/projects/${p.id}/board`, missing: false });
  for (const i of issues) {
    const key = formatIssueKey(i.project.key, i.number);
    out.set(`ISSUE:${i.id}`, { kind: "issue", id: i.id, label: `${key} ${i.title}`, sub: i.status, href: `/projects/${i.projectId}/backlog?issue=${key}`, missing: false });
  }
  for (const s of sprints) out.set(`SPRINT:${s.id}`, { kind: "sprint", id: s.id, label: s.name, sub: s.project?.name ?? null, href: s.projectId ? `/projects/${s.projectId}/backlog` : null, missing: false });
  for (const u of users) out.set(`USER:${u.id}`, { kind: "user", id: u.id, label: `@${u.name}`, sub: null, href: null, missing: false });
  for (const c of cards) out.set(`CARD:${c.id}`, { kind: "card", id: c.id, label: c.title, sub: `${categoryLabel(c.category)} · ${c._count.items} ${c._count.items === 1 ? "archivo" : "archivos"}`, href: `/library?tarjeta=${c.id}`, missing: false });
  return out;
}

type Row = Awaited<ReturnType<typeof prisma.chatMessage.findMany<{ include: typeof messageInclude }>>>[number];

export async function toDTOs(rows: Row[], workspaceId: string): Promise<ChatMessageDTO[]> {
  const resolved = await resolveRefs(rows.flatMap((r) => r.refs.map((x) => ({ kind: x.kind, targetId: x.targetId }))), workspaceId);
  return rows.map((r) => {
    // Las marcas del texto (no las filas) mandan el orden; las filas sirven para filtrar.
    const refs = parseRefs(r.body).map((p): ResolvedRef => {
      const hit = resolved.get(`${p.kind.toUpperCase()}:${p.id}`);
      return hit ?? { kind: p.kind, id: p.id, label: "(eliminado)", sub: null, href: null, missing: true };
    });
    const grouped = new Map<string, { emoji: string; count: number; users: string[]; userIds: string[] }>();
    for (const x of r.reactions) {
      const g = grouped.get(x.emoji) ?? { emoji: x.emoji, count: 0, users: [], userIds: [] };
      g.count++;
      g.users.push(x.user.name);
      g.userIds.push(x.user.id);
      grouped.set(x.emoji, g);
    }
    return {
      id: r.id,
      body: r.body,
      channel: r.channel?.name ?? null,
      level: r.level === "URGENTE" || r.level === "AYUDA" ? r.level : null,
      announce: !!r.announce,
      updatedAt: r.updatedAt.toISOString(),
      replyTo: r.replyTo && !r.replyTo.deletedAt ? { id: r.replyTo.id, author: r.replyTo.author?.name ?? null, snippet: snippetOf(r.replyTo.body, r.replyTo._count.files > 0) } : null,
      reactions: [...grouped.values()],
      createdAt: r.createdAt.toISOString(),
      author: r.author ? { id: r.author.id, name: r.author.name, color: r.author.chatColor } : null,
      refs,
      files: r.files,
    };
  });
}

// Últimos mensajes (cronológico). after: solo los más nuevos. projectId: solo los que mencionan ese proyecto.
// channel: filtro de un canal (ver channelFilter). announce: solo los avisos por comando de todos los canales.
export async function loadMessages(opts: { workspaceId: string; viewerId: string; after?: Date | null; projectId?: string | null; limit?: number; channel?: object | null; announce?: boolean }): Promise<ChatMessageDTO[]> {
  const projectFilter = {
    workspaceId: opts.workspaceId,
    deletedAt: null,
    ...(opts.projectId ? { refs: { some: { projectId: opts.projectId } } } : {}),
    ...(opts.announce ? { announce: true } : {}),
    // AND para no pisar el OR de "General"; siempre se filtran los canales privados ajenos.
    AND: [messageVisibleTo(opts.viewerId), ...(opts.channel ? [opts.channel] : [])],
  };
  // Con "after" se devuelve lo que cambió desde entonces (mensajes nuevos, reacciones, borrados).
  if (opts.after) {
    const changed = await prisma.chatMessage.findMany({ where: { updatedAt: { gt: opts.after }, ...projectFilter }, orderBy: { updatedAt: "asc" }, take: 200, include: messageInclude });
    return toDTOs(changed, opts.workspaceId);
  }
  const rows = await prisma.chatMessage.findMany({ where: projectFilter, orderBy: { createdAt: "desc" }, take: opts.limit ?? 100, include: messageInclude });
  return toDTOs(rows.reverse(), opts.workspaceId);
}

export { messageInclude };

// Menciones de un texto ya validadas contra el equipo, listas para guardar como ChatRef (cada una con su proyecto).
export async function refRowsFor(body: string, workspaceId: string) {
  const wanted = parseRefs(body);
  const resolved = await resolveRefs(wanted.map((r) => ({ kind: r.kind.toUpperCase(), targetId: r.id })), workspaceId);
  const found = wanted.filter((r) => resolved.has(`${r.kind.toUpperCase()}:${r.id}`));
  const [issues, sprints] = await Promise.all([
    prisma.task.findMany({ where: { id: { in: found.filter((r) => r.kind === "issue").map((r) => r.id) }, project: { workspaceId } }, select: { id: true, projectId: true } }),
    prisma.sprint.findMany({ where: { id: { in: found.filter((r) => r.kind === "sprint").map((r) => r.id) }, project: { workspaceId } }, select: { id: true, projectId: true } }),
  ]);
  const projectOf = (kind: string, id: string): string | null => (kind === "project" ? id : kind === "issue" ? issues.find((i) => i.id === id)?.projectId ?? null : kind === "sprint" ? sprints.find((s) => s.id === id)?.projectId ?? null : null);
  return { resolved, rows: found.map((r) => ({ kind: r.kind.toUpperCase(), targetId: r.id, projectId: projectOf(r.kind, r.id) })) };
}
