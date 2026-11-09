import "server-only";
import { prisma } from "@/lib/prisma";
import { formatIssueKey } from "@/lib/scrum/issueKey";
import { linkService, parseTags, previewUrl } from "@/lib/scrum/resources";
import { normalizeCategory } from "@/lib/scrum/library";

export type CardItemDTO = {
  id: string;
  kind: "FILE" | "LINK";
  title: string;
  note: string;
  url: string | null;
  fileUrl: string | null; // dónde se descarga o ve el archivo (para FILE)
  createdAt: string;
  uploadedBy: string | null;
  service: string | null;
  preview: string | null;
  filename: string | null;
  mimeType: string | null;
  size: number | null;
};

export type CardDTO = {
  id: string;
  auto?: boolean; // tarjeta automática de un proyecto: junta lo que se sube en su pestaña Archivos (no se edita aquí)
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

const itemSelect = { id: true, kind: true, title: true, note: true, url: true, filename: true, mimeType: true, size: true, createdAt: true, uploadedBy: { select: { name: true } } } as const;

export const cardInclude = {
  project: { select: { id: true, name: true, key: true } },
  createdBy: { select: { id: true, name: true } },
  items: { select: itemSelect, orderBy: { createdAt: "asc" } },
} as const;

type CardRow = {
  id: string; title: string; description: string; category: string; tags: string; createdAt: Date; updatedAt: Date;
  project: { id: string; name: string; key: string | null } | null;
  createdBy: { id: string; name: string } | null;
  items: Array<{ id: string; kind: string; title: string; note: string; url: string | null; filename: string | null; mimeType: string | null; size: number | null; createdAt: Date; uploadedBy: { name: string } | null }>;
};

export function toItemDTO(i: CardRow["items"][number], fileBase = "/api/library/items"): CardItemDTO {
  const kind = i.kind === "LINK" ? "LINK" : "FILE";
  return { id: i.id, kind, title: i.title, note: i.note, url: i.url, fileUrl: kind === "FILE" ? `${fileBase}/${i.id}/file` : null, createdAt: i.createdAt.toISOString(), uploadedBy: i.uploadedBy?.name ?? null, service: i.url ? linkService(i.url) : null, preview: i.url ? previewUrl(i.url) : null, filename: i.filename, mimeType: i.mimeType, size: i.size };
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
    items: c.items.map((i) => toItemDTO(i)),
  };
}

// Tarjetas automáticas: una por proyecto que tenga archivos o enlaces en su pestaña Archivos. No duplican nada: se arman
// al leer, así que siempre están al día.
export const AUTO_PREFIX = "project:";
export async function projectCards(workspaceId: string): Promise<CardDTO[]> {
  const rows = await prisma.projectResource.findMany({
    where: { project: { workspaceId } },
    orderBy: { createdAt: "asc" },
    select: { id: true, kind: true, title: true, url: true, filename: true, mimeType: true, size: true, tags: true, createdAt: true, projectId: true, project: { select: { id: true, name: true, key: true } }, uploadedBy: { select: { name: true } } },
    take: 3000,
  });
  const byProject = new Map<string, typeof rows>();
  for (const r of rows) byProject.set(r.projectId, [...(byProject.get(r.projectId) ?? []), r]);
  return [...byProject.values()].map((list) => {
    const project = list[0].project;
    const last = list[list.length - 1].createdAt;
    const tags = [...new Set(list.flatMap((r) => parseTags(r.tags)))].slice(0, 10);
    return {
      id: `${AUTO_PREFIX}${project.id}`,
      auto: true,
      title: `Archivos de ${project.name}`,
      description: "Se arma sola con lo que se sube en la pestaña Archivos del proyecto.",
      category: "REFERENCIA",
      tags,
      createdAt: list[0].createdAt.toISOString(),
      updatedAt: last.toISOString(),
      project,
      createdBy: null,
      items: list.map((r) => toItemDTO({ id: r.id, kind: r.kind, title: r.title, note: "", url: r.url, filename: r.filename, mimeType: r.mimeType, size: r.size, createdAt: r.createdAt, uploadedBy: r.uploadedBy }, "/api/resources")),
    };
  });
}

export async function listCards(workspaceId: string): Promise<CardDTO[]> {
  const [rows, auto] = await Promise.all([prisma.fileCard.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" }, include: cardInclude, take: 300 }), projectCards(workspaceId)]);
  return [...rows.map((r) => toCardDTO(r)), ...auto].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
