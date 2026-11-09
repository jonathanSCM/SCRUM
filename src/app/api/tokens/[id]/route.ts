import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { parseBody, readJson } from "@/lib/validation";

// Solo la persona dueña del token puede cambiarlo o borrarlo (siempre con su sesión de navegador).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const parsed = parseBody(z.object({ name: z.string().trim().min(1).max(40).optional(), allowDelete: z.boolean().optional() }), await readJson(req));
  if ("error" in parsed) return parsed.error;
  try {
    const res = await prisma.apiToken.updateMany({ where: { id, userId: auth.user.id }, data: { ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}), ...(parsed.data.allowDelete !== undefined ? { allowDelete: parsed.data.allowDelete } : {}) } });
    if (res.count === 0) return notFound("Token no encontrado");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  try {
    const res = await prisma.apiToken.deleteMany({ where: { id, userId: auth.user.id } });
    if (res.count === 0) return notFound("Token no encontrado");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
