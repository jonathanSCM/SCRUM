import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { parseBody, readJson, updateContactSchema } from "@/lib/validation";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ contact: (await params).id });
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = parseBody(updateContactSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;

  try {
    const current = await prisma.projectContact.findUnique({ where: { id }, select: { id: true } });
    if (!current) return notFound("Contacto no encontrado");
    return NextResponse.json(await prisma.projectContact.update({ where: { id }, data: parsed.data }));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ contact: (await params).id });
  if ("error" in auth) return auth.error;
  const { id } = await params;

  try {
    const current = await prisma.projectContact.findUnique({ where: { id }, select: { id: true } });
    if (!current) return notFound("Contacto no encontrado");
    await prisma.projectContact.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
