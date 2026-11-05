import "server-only";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/scrum/roles";

export type ChannelDTO = { id: string; name: string; kind: "GENERAL" | "REUNIONES" | "CUSTOM" };

const DEFAULTS = [
  { slug: "general", name: "General", kind: "GENERAL" },
  { slug: "reuniones", name: "Reuniones", kind: "REUNIONES" },
] as const;

// Devuelve los canales del equipo, creando "General" y "Reuniones" la primera vez.
export async function ensureChannels(workspaceId: string): Promise<ChannelDTO[]> {
  let rows = await prisma.chatChannel.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
  const missing = DEFAULTS.filter((d) => !rows.some((r) => r.slug === d.slug));
  if (missing.length) {
    for (const d of missing) {
      await prisma.chatChannel.upsert({ where: { workspaceId_slug: { workspaceId, slug: d.slug } }, create: { workspaceId, ...d }, update: {} });
    }
    rows = await prisma.chatChannel.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
  }
  const order = (k: string) => (k === "GENERAL" ? 0 : k === "REUNIONES" ? 1 : 2);
  return rows.sort((a, b) => order(a.kind) - order(b.kind) || a.createdAt.getTime() - b.createdAt.getTime()).map((r) => ({ id: r.id, name: r.name, kind: r.kind as ChannelDTO["kind"] }));
}

export const channelSlug = (name: string) => slugify(name) || "canal";

// Filtro de mensajes de un canal. En "General" entran también los mensajes anteriores a los canales (sin canal).
export async function channelFilter(workspaceId: string, channelId: string) {
  const ch = await prisma.chatChannel.findFirst({ where: { id: channelId, workspaceId }, select: { id: true, kind: true } });
  if (!ch) return null;
  return ch.kind === "GENERAL" ? { OR: [{ channelId: ch.id }, { channelId: null }] } : { channelId: ch.id };
}
