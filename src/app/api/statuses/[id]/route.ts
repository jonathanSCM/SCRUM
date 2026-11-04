import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { parseBody, readJson, statusOptionSchema } from "@/lib/validation";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ lead: true });
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = parseBody(statusOptionSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;

  try {
    const exists = await prisma.statusOption.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return notFound("Estado no encontrado");
    const status = await prisma.statusOption.update({ where: { id }, data: parsed.data });
    return NextResponse.json(status);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ lead: true });
  if ("error" in auth) return auth.error;
  const { id } = await params;

  try {
    const status = await prisma.statusOption.findUnique({ where: { id }, include: { _count: { select: { projects: true } } } });
    if (!status) return notFound("Estado no encontrado");
    if (status._count.projects > 0) {
      return NextResponse.json({ error: `Hay ${status._count.projects} proyecto(s) en este estado: movelos antes de borrarlo` }, { status: 400 });
    }
    const total = await prisma.statusOption.count();
    if (total <= 1) return NextResponse.json({ error: "Tiene que quedar al menos un estado" }, { status: 400 });
    await prisma.statusOption.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
