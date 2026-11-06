import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { generateToken, hashToken } from "@/lib/apiToken";
import { activeAccess } from "@/lib/workspace";

// Gestión del token IA de la propia persona (solo con sesión de navegador).
export async function GET() {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  try {
    const [token, logs] = await Promise.all([
      prisma.apiToken.findUnique({ where: { userId: auth.user.id }, select: { prefix: true, createdAt: true, lastUsedAt: true, allowDelete: true } }),
      prisma.apiTokenLog.findMany({ where: { userId: auth.user.id }, orderBy: { createdAt: "desc" }, take: 30, select: { route: true, createdAt: true } }),
    ]);
    return NextResponse.json({ token, logs });
  } catch (e) {
    return errorResponse(e);
  }
}

// Crea un token nuevo (invalida el anterior). El texto completo se devuelve UNA sola vez.
export async function POST(req: Request) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  try {
    // El token actúa solo dentro del equipo que está activo al crearlo.
    const access = await activeAccess(auth.user.id);
    if (!access) return NextResponse.json({ error: "No pertenecés a ningún equipo" }, { status: 400 });
    const wantDelete = ((await req.json().catch(() => ({}))) as { allowDelete?: boolean }).allowDelete === true;
    const token = generateToken();
    await prisma.$transaction([
      prisma.apiToken.deleteMany({ where: { userId: auth.user.id } }),
      prisma.apiToken.create({ data: { userId: auth.user.id, tokenHash: hashToken(token), prefix: token.slice(0, 10), workspaceId: access.workspaceId, allowDelete: wantDelete } }),
    ]);
    return NextResponse.json({ token, prefix: token.slice(0, 10) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

// Activa o desactiva "permitir borrar" sin cambiar el token.
export async function PATCH(req: Request) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  try {
    const { allowDelete } = (await req.json().catch(() => ({}))) as { allowDelete?: boolean };
    if (typeof allowDelete !== "boolean") return NextResponse.json({ error: "Falta allowDelete" }, { status: 400 });
    const res = await prisma.apiToken.updateMany({ where: { userId: auth.user.id }, data: { allowDelete } });
    if (res.count === 0) return NextResponse.json({ error: "No tenés un token" }, { status: 404 });
    return NextResponse.json({ ok: true, allowDelete });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE() {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  try {
    await prisma.apiToken.deleteMany({ where: { userId: auth.user.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
