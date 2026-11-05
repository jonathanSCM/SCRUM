import "server-only";
import { prisma } from "@/lib/prisma";
import { formatIssueKey } from "@/lib/scrum/issueKey";
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
  createdAt: string;
  author: { id: string; name: string; color: string | null } | null;
  refs: ResolvedRef[];
  files: Array<{ id: string; filename: string; mimeType: string; size: number }>;
  updatedAt: string;
  replyTo: { id: string; author: string | null; snippet: string } | null;
  reactions: Array<{ emoji: string; count: number; users: string[]; userIds: string[] }>;
};

const messageInclude = {
  author: { select: { id: true, name: true, chatColor: true } },
  refs: true,
  files: { select: { id: true, filename: true, mimeType: true, size: true } },
  reactions: { orderBy: { createdAt: "asc" }, include: { user: { select: { id: true, name: true } } } },
  replyTo: { select: { id: true, body: true, deletedAt: true, author: { select: { name: true } }, _count: { select: { files: true } } } },
} as const;

export async function resolveRefs(refs: Array<{ kind: string; targetId: string }>): Promise<Map<string, ResolvedRef>> {
  const ids = (kind: string) => [...new Set(refs.filter((r) => r.kind === kind).map((r) => r.targetId))];
  const [projects, issues, sprints, users] = await Promise.all([
    prisma.project.findMany({ where: { id: { in: ids("PROJECT") } }, select: { id: true, name: true, key: true } }),
    prisma.task.findMany({ where: { id: { in: ids("ISSUE") } }, select: { id: true, number: true, title: true, status: true, projectId: true, project: { select: { key: true } } } }),
    prisma.sprint.findMany({ where: { id: { in: ids("SPRINT") } }, select: { id: true, name: true, state: true, projectId: true, project: { select: { name: true } } } }),
    prisma.user.findMany({ where: { id: { in: ids("USER") } }, select: { id: true, name: true } }),
  ]);

  const out = new Map<string, ResolvedRef>();
  for (const p of projects) out.set(`PROJECT:${p.id}`, { kind: "project", id: p.id, label: p.name, sub: p.key, href: `/projects/${p.id}/board`, missing: false });
  for (const i of issues) {
    const key = formatIssueKey(i.project.key, i.number);
    out.set(`ISSUE:${i.id}`, { kind: "issue", id: i.id, label: `${key} ${i.title}`, sub: i.status, href: `/projects/${i.projectId}/backlog?issue=${key}`, missing: false });
  }
  for (const s of sprints) out.set(`SPRINT:${s.id}`, { kind: "sprint", id: s.id, label: s.name, sub: s.project?.name ?? null, href: s.projectId ? `/projects/${s.projectId}/backlog` : null, missing: false });
  for (const u of users) out.set(`USER:${u.id}`, { kind: "user", id: u.id, label: `@${u.name}`, sub: null, href: null, missing: false });
  return out;
}

type Row = Awaited<ReturnType<typeof prisma.chatMessage.findMany<{ include: typeof messageInclude }>>>[number];

export async function toDTOs(rows: Row[]): Promise<ChatMessageDTO[]> {
  const resolved = await resolveRefs(rows.flatMap((r) => r.refs.map((x) => ({ kind: x.kind, targetId: x.targetId }))));
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
export async function loadMessages(opts: { after?: Date | null; projectId?: string | null; limit?: number } = {}): Promise<ChatMessageDTO[]> {
  const projectFilter = { deletedAt: null, ...(opts.projectId ? { refs: { some: { projectId: opts.projectId } } } : {}) };
  // Con "after" se devuelve lo que cambió desde entonces (mensajes nuevos, reacciones, borrados).
  if (opts.after) {
    const changed = await prisma.chatMessage.findMany({ where: { updatedAt: { gt: opts.after }, ...projectFilter }, orderBy: { updatedAt: "asc" }, take: 200, include: messageInclude });
    return toDTOs(changed);
  }
  const rows = await prisma.chatMessage.findMany({ where: projectFilter, orderBy: { createdAt: "desc" }, take: opts.limit ?? 100, include: messageInclude });
  return toDTOs(rows.reverse());
}

export { messageInclude };
