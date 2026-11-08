import "server-only";
import { prisma } from "@/lib/prisma";
import { formatIssueKey } from "@/lib/scrum/issueKey";
import { linkService, parseTags, previewUrl } from "@/lib/scrum/resources";
import { normalizeCategory } from "@/lib/scrum/library";

export type CardItemDTO = {
  id: string;
  kind: "FILE" | "LINK";
  title: string;
  url: string | null;
  service: string | null;
  preview: string | null;
  filename: string | null;
  mimeType: string | null;
  size: number | null;
};

export type CardDTO = {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  project: { id: string; name: string; key: string | null } | null;
  createdBy: { id: string; name: string } | null;
  items: CardItemDTO[];
};

const itemSelect = { id: true, kind: true, title: true, url: true, filename: true, mimeType: true, size: true } as const;

export const cardInclude = {
  project: { select: { id: true, name: true, key: true } },
  createdBy: { select: { id: true, name: true } },
  items: { select: itemSelect, orderBy: { createdAt: "asc" } },
} as const;

type CardRow = {
  id: string; title: string; description: string; category: string; tags: string; createdAt: Date; updatedAt: Date;
  project: { id: string; name: string; key: string | null } | null;
  createdBy: { id: string; name: string } | null;
  items: Array<{ id: string; kind: string; title: string; url: string | null; filename: string | null; mimeType: string | null; size: number | null }>;
};

export function toItemDTO(i: CardRow["items"][number]): CardItemDTO {
  return { id: i.id, kind: i.kind === "LINK" ? "LINK" : "FILE", title: i.title, url: i.url, service: i.url ? linkService(i.url) : null, preview: i.url ? previewUrl(i.url) : null, filename: i.filename, mimeType: i.mimeType, size: i.size };
}

export function toCardDTO(c: CardRow): CardDTO {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    category: normalizeCategory(c.category),
    tags: parseTags(c.tags),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    project: c.project,
    createdBy: c.createdBy,
    items: c.items.map(toItemDTO),
  };
}

export async function listCards(workspaceId: string): Promise<CardDTO[]> {
  const rows = await prisma.fileCard.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" }, include: cardInclude, take: 300 });
  return rows.map((r) => toCardDTO(r));
}

export async function cardById(id: string): Promise<CardDTO | null> {
  const row = await prisma.fileCard.findUnique({ where: { id }, include: cardInclude });
  return row ? toCardDTO(row) : null;
}

// Tamaño total de archivos de una tarjeta (para el tope).
export async function cardUsage(cardId: string): Promise<{ items: number; bytes: number }> {
  const agg = await prisma.fileCardItem.aggregate({ where: { cardId }, _count: { _all: true }, _sum: { size: true } });
  return { items: agg._count._all, bytes: agg._sum.size ?? 0 };
}

export const keyOfIssue = formatIssueKey;
