import "server-only";
import { prisma } from "@/lib/prisma";
import { formatIssueKey } from "@/lib/scrum/issueKey";
import { friendlyTitle, linkService, parseTags, previewUrl } from "@/lib/scrum/resources";

export type ResourceDTO = {
  id: string;
  kind: "FILE" | "LINK";
  title: string;
  url: string | null;
  service: string | null;
  preview: string | null; // dirección para ver el enlace dentro de la app (Drive, Docs, Figma)
  filename: string | null;
  mimeType: string | null;
  size: number | null;
  tags: string[];
  createdAt: string;
  sprint: { id: string; name: string } | null;
  task: { id: string; key: string; title: string } | null;
  uploadedBy: { id: string; name: string } | null;
};

// Sin el contenido (data): para listas.
export const resourceSelect = {
  id: true, kind: true, title: true, url: true, filename: true, mimeType: true, size: true, tags: true, createdAt: true,
  sprint: { select: { id: true, name: true } },
  task: { select: { id: true, number: true, title: true } },
  uploadedBy: { select: { id: true, name: true } },
} as const;

type Row = {
  id: string; kind: string; title: string; url: string | null; filename: string | null; mimeType: string | null; size: number | null; tags: string; createdAt: Date;
  sprint: { id: string; name: string } | null; task: { id: string; number: number | null; title: string } | null; uploadedBy: { id: string; name: string } | null;
};

export function toResourceDTO(r: Row, projectKey: string | null): ResourceDTO {
  return {
    id: r.id,
    kind: r.kind === "LINK" ? "LINK" : "FILE",
    title: r.title,
    url: r.url,
    service: r.url ? linkService(r.url) : null,
    preview: r.url ? previewUrl(r.url) : null,
    filename: r.filename,
    mimeType: r.mimeType,
    size: r.size,
    tags: parseTags(r.tags),
    createdAt: r.createdAt.toISOString(),
    sprint: r.sprint,
    task: r.task ? { id: r.task.id, key: formatIssueKey(projectKey, r.task.number), title: r.task.title } : null,
    uploadedBy: r.uploadedBy,
  };
}

export async function listResources(projectId: string, filter: { taskId?: string | null; sprintId?: string | null } = {}): Promise<ResourceDTO[]> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { key: true } });
  const rows = await prisma.projectResource.findMany({ where: { projectId, ...(filter.taskId ? { taskId: filter.taskId } : {}), ...(filter.sprintId ? { sprintId: filter.sprintId } : {}) }, orderBy: { createdAt: "desc" }, select: resourceSelect, take: 500 });
  return rows.map((r) => toResourceDTO(r, project?.key ?? null));
}

// Comprueba que el sprint y el ticket elegidos son de este proyecto.
export async function checkBelongsTo(projectId: string, sprintId: string | null | undefined, taskId: string | null | undefined): Promise<string | null> {
  if (sprintId && !(await prisma.sprint.findFirst({ where: { id: sprintId, projectId }, select: { id: true } }))) return "Ese sprint no es de este proyecto";
  if (taskId && !(await prisma.task.findFirst({ where: { id: taskId, projectId }, select: { id: true } }))) return "Ese ticket no es de este proyecto";
  return null;
}
