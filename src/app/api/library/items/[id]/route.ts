import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { parseBody, readJson } from "@/lib/validation";
import { cardById } from "@/lib/libraryData";

async function gate(id: string, user: { id: string; role: string }) {
  const item = await prisma.fileCardItem.findUnique({ where: { id }, select: { cardId: true, uploadedById: true, card: { select: { createdById: true } } } });
  if (!item) return { error: notFound("No encontrado") };
  const own = item.uploadedById === user.id || item.card.createdById === user.id;
  if (!own && user.role !== "LEAD") return { error: NextResponse.json({ error: "Solo quien lo subió, quien creó la tarjeta o un líder puede cambiarlo" }, { status: 403 }) };
  return { item };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ fileCardItem: id });
  if ("error" in auth) return auth.error;
  const parsed = parseBody(z.object({ title: z.string().trim().min(1).max(200).optional(), note: z.string().trim().max(1000).optional() }), await readJson(req));
  if ("error" in parsed) return parsed.error;
  try {
    const g = await gate(id, auth.user);
    if ("error" in g) return g.error;
    await prisma.fileCardItem.update({ where: { id }, data: { ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}), ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}) } });
    return NextResponse.json(await cardById(g.item.cardId));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ fileCardItem: id });
  if ("error" in auth) return auth.error;
  try {
    const g = await gate(id, auth.user);
    if ("error" in g) return g.error;
    await prisma.fileCardItem.delete({ where: { id } });
    return NextResponse.json(await cardById(g.item.cardId));
  } catch (e) {
    return errorResponse(e);
  }
}
