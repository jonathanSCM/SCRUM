import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { parseBody, readJson } from "@/lib/validation";
import { normalizeTags } from "@/lib/scrum/resources";
import { CATEGORY_VALUES } from "@/lib/scrum/library";
import { cardInclude, toCardDTO } from "@/lib/libraryData";

async function canEdit(id: string, user: { id: string; role: string }) {
  const card = await prisma.fileCard.findUnique({ where: { id }, select: { createdById: true, workspaceId: true } });
  if (!card) return { error: notFound("Tarjeta no encontrada") };
  if (card.createdById !== user.id && user.role !== "LEAD") return { error: NextResponse.json({ error: "Solo quien creó la tarjeta o un líder puede cambiarla" }, { status: 403 }) };
  return { card };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ fileCard: id });
  if ("error" in auth) return auth.error;
  const parsed = parseBody(
    z.object({
      title: z.string().trim().min(1).max(200).optional(),
      description: z.string().trim().max(5000).optional(),
      category: z.enum(CATEGORY_VALUES).optional(),
      tags: z.array(z.string()).max(30).optional(),
      projectId: z.string().min(1).max(40).nullable().optional(),
    }),
    await readJson(req)
  );
  if ("error" in parsed) return parsed.error;
  const d = parsed.data;
  try {
    const gate = await canEdit(id, auth.user);
    if ("error" in gate) return gate.error;
    if (d.projectId && !(await prisma.project.findFirst({ where: { id: d.projectId, workspaceId: gate.card.workspaceId }, select: { id: true } }))) return NextResponse.json({ error: "Ese proyecto no es de este equipo" }, { status: 400 });
    const row = await prisma.fileCard.update({
      where: { id },
      data: { ...(d.title !== undefined ? { title: d.title } : {}), ...(d.description !== undefined ? { description: d.description } : {}), ...(d.category ? { category: d.category } : {}), ...(d.tags ? { tags: JSON.stringify(normalizeTags(d.tags)) } : {}), ...(d.projectId !== undefined ? { projectId: d.projectId } : {}) },
      include: cardInclude,
    });
    return NextResponse.json(toCardDTO(row));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ fileCard: id });
  if ("error" in auth) return auth.error;
  try {
    const gate = await canEdit(id, auth.user);
    if ("error" in gate) return gate.error;
    await prisma.fileCard.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
