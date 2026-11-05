import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { generateToken, hashToken } from "@/lib/apiToken";

// Gestión del token IA de la propia persona (solo con sesión de navegador).
export async function GET() {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  try {
    const [token, logs] = await Promise.all([
      prisma.apiToken.findUnique({ where: { userId: auth.user.id }, select: { prefix: true, createdAt: true, lastUsedAt: true } }),
      prisma.apiTokenLog.findMany({ where: { userId: auth.user.id }, orderBy: { createdAt: "desc" }, take: 30, select: { route: true, createdAt: true } }),
    ]);
    return NextResponse.json({ token, logs });
  } catch (e) {
    return errorResponse(e);
  }
}

// Crea un token nuevo (invalida el anterior). El texto completo se devuelve UNA sola vez.
export async function POST() {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  try {
    const token = generateToken();
    await prisma.$transaction([
      prisma.apiToken.deleteMany({ where: { userId: auth.user.id } }),
      prisma.apiToken.create({ data: { userId: auth.user.id, tokenHash: hashToken(token), prefix: token.slice(0, 10) } }),
    ]);
    return NextResponse.json({ token, prefix: token.slice(0, 10) }, { status: 201 });
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
