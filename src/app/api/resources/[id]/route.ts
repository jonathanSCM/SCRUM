import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { logHistory } from "@/lib/history";
import { normalizeTags, normalizeUrl } from "@/lib/scrum/resources";
import { parseBody, readJson } from "@/lib/validation";
import { checkBelongsTo, resourceSelect, toResourceDTO } from "@/lib/resourceData";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  url: z.string().trim().max(2000).optional(),
  tags: z.array(z.string()).max(30).optional(),
  sprintId: z.string().min(1).max(40).nullable().optional(),
  taskId: z.string().min(1).max(40).nullable().optional(),
});

// Editar título, etiquetas y a qué pertenece. Lo hace quien lo subió o un líder.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ resource: id });
  if ("error" in auth) return auth.error;
  const parsed = parseBody(patchSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  try {
    const cur = await prisma.projectResource.findUnique({ where: { id }, select: { projectId: true, kind: true, uploadedById: true, project: { select: { key: true } } } });
    if (!cur) return notFound("No encontrado");
    if (cur.uploadedById !== auth.user.id && auth.user.role !== "LEAD") return NextResponse.json({ error: "Solo quien lo subió o un líder puede editarlo" }, { status: 403 });
    const bad = await checkBelongsTo(cur.projectId, body.sprintId, body.taskId);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });

    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.tags !== undefined) data.tags = JSON.stringify(normalizeTags(body.tags));
    if (body.sprintId !== undefined) data.sprintId = body.sprintId;
    if (body.taskId !== undefined) data.taskId = body.taskId;
    if (body.url !== undefined && cur.kind === "LINK") {
      const url = normalizeUrl(body.url);
      if (!url) return NextResponse.json({ error: "Enlace inválido" }, { status: 400 });
      data.url = url;
    }
    const row = await prisma.projectResource.update({ where: { id }, data, select: resourceSelect });
    return NextResponse.json(toResourceDTO(row, cur.project.key));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ resource: id });
  if ("error" in auth) return auth.error;
  try {
    const cur = await prisma.projectResource.findUnique({ where: { id }, select: { projectId: true, title: true, uploadedById: true } });
    if (!cur) return notFound("No encontrado");
    if (cur.uploadedById !== auth.user.id && auth.user.role !== "LEAD") return NextResponse.json({ error: "Solo quien lo subió o un líder puede borrarlo" }, { status: 403 });
    await prisma.projectResource.delete({ where: { id } });
    await logHistory({ projectId: cur.projectId, field: "archivo_eliminado_proyecto", oldValue: cur.title, actor: auth.user });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
