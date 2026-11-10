import "server-only";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/scrum/roles";
import { snippetOf } from "@/lib/scrum/chat";

export type ChannelDTO = { id: string; name: string; kind: "GENERAL" | "REUNIONES" | "CUSTOM" | "PROJECT"; projectId: string | null; projectKey: string | null };

const DEFAULTS = [
  { slug: "general", name: "General", kind: "GENERAL" },
  { slug: "reuniones", name: "Reuniones", kind: "REUNIONES" },
] as const;

// Devuelve los canales del equipo. Crea "General" y "Reuniones" la primera vez, y un canal por cada proyecto
// (el chat del proyecto es su canal). El nombre de un canal de proyecto es el del proyecto, siempre al día.
export async function ensureChannels(workspaceId: string): Promise<ChannelDTO[]> {
  const [rows, projects] = await Promise.all([
    prisma.chatChannel.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" }, include: { project: { select: { name: true, key: true } } } }),
    prisma.project.findMany({ where: { workspaceId }, select: { id: true, name: true, key: true } }),
  ]);
  let list = rows;
  const missingDefaults = DEFAULTS.filter((d) => !rows.some((r) => r.slug === d.slug));
  const missingProjects = projects.filter((p) => !rows.some((r) => r.projectId === p.id));
  if (missingDefaults.length || missingProjects.length) {
    for (const d of missingDefaults) await prisma.chatChannel.upsert({ where: { workspaceId_slug: { workspaceId, slug: d.slug } }, create: { workspaceId, ...d }, update: {} });
    for (const p of missingProjects) await prisma.chatChannel.upsert({ where: { workspaceId_slug: { workspaceId, slug: `proyecto-${p.id}` } }, create: { workspaceId, slug: `proyecto-${p.id}`, name: p.name, kind: "PROJECT", projectId: p.id }, update: {} });
    list = await prisma.chatChannel.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" }, include: { project: { select: { name: true, key: true } } } });
  }
  const order = (k: string) => (k === "GENERAL" ? 0 : k === "REUNIONES" ? 1 : k === "CUSTOM" ? 2 : 3);
  return list
    .map((r) => ({ id: r.id, name: r.kind === "PROJECT" && r.project ? r.project.name : r.name, kind: r.kind as ChannelDTO["kind"], projectId: r.projectId, projectKey: r.project?.key ?? null, at: r.createdAt.getTime() }))
    .sort((a, b) => order(a.kind) - order(b.kind) || (a.kind === "PROJECT" ? a.name.localeCompare(b.name) : a.at - b.at))
    .map(({ at: _at, ...c }) => c);
}

export const channelSlug = (name: string) => slugify(name) || "canal";

// Filtro de mensajes de un canal. En "General" entran también los mensajes anteriores a los canales (sin canal).
export async function channelFilter(workspaceId: string, channelId: string) {
  const ch = await prisma.chatChannel.findFirst({ where: { id: channelId, workspaceId }, select: { id: true, kind: true } });
  if (!ch) return null;
  return ch.kind === "GENERAL" ? { OR: [{ channelId: ch.id }, { channelId: null }] } : { channelId: ch.id };
}

export type ChannelSummary = ChannelDTO & { unread: number; last: { text: string; at: string; author: string | null } | null };

// Lista de canales para el panel izquierdo del chat: último mensaje y mensajes sin leer de cada uno.
// La primera vez que alguien ve un canal se marca como leído hasta ahora (no se llena de "sin leer" lo anterior).
export async function channelSummaries(workspaceId: string, userId: string): Promise<ChannelSummary[]> {
  const channels = await ensureChannels(workspaceId);
  const now = new Date();
  const reads = await prisma.chatRead.findMany({ where: { userId, channelId: { in: channels.map((c) => c.id) } } });
  const lastRead = new Map(reads.map((r) => [r.channelId, r.lastReadAt]));
  for (const c of channels) {
    if (!lastRead.has(c.id)) {
      await prisma.chatRead.upsert({ where: { userId_channelId: { userId, channelId: c.id } }, create: { userId, channelId: c.id, lastReadAt: now }, update: {} });
      lastRead.set(c.id, now);
    }
  }
  const generalId = channels.find((c) => c.kind === "GENERAL")?.id ?? null;
  const norm = (id: string | null) => id ?? generalId;
  const since = new Date(Math.min(...[...lastRead.values()].map((d) => d.getTime())));
  const [fresh, lasts] = await Promise.all([
    prisma.chatMessage.findMany({ where: { workspaceId, deletedAt: null, createdAt: { gt: since }, authorId: { not: userId } }, select: { channelId: true, createdAt: true }, take: 3000 }),
    prisma.chatMessage.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      distinct: ["channelId"],
      select: { channelId: true, body: true, createdAt: true, author: { select: { name: true } }, _count: { select: { files: true } } },
    }),
  ]);
  const unread = new Map<string, number>();
  for (const m of fresh) {
    const id = norm(m.channelId);
    if (id && m.createdAt > (lastRead.get(id) ?? now)) unread.set(id, (unread.get(id) ?? 0) + 1);
  }
  // Los mensajes sin canal (anteriores a los canales) cuentan como General: se toma el más reciente entre ambos.
  const lastBy = new Map<string, (typeof lasts)[number]>();
  for (const m of lasts) {
    const id = norm(m.channelId);
    if (!id) continue;
    const cur = lastBy.get(id);
    if (!cur || m.createdAt > cur.createdAt) lastBy.set(id, m);
  }
  return channels.map((c) => {
    const m = lastBy.get(c.id);
    return { ...c, unread: unread.get(c.id) ?? 0, last: m ? { text: snippetOf(m.body, m._count.files > 0, 70), at: m.createdAt.toISOString(), author: m.author?.name ?? null } : null };
  });
}

export async function markChannelRead(workspaceId: string, userId: string, channelId: string): Promise<boolean> {
  const ch = await prisma.chatChannel.findFirst({ where: { id: channelId, workspaceId }, select: { id: true } });
  if (!ch) return false;
  await prisma.chatRead.upsert({ where: { userId_channelId: { userId, channelId } }, create: { userId, channelId }, update: { lastReadAt: new Date() } });
  return true;
}
