import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { generateToken, hashToken, MAX_TOKENS_PER_USER } from "@/lib/apiToken";
import { encryptSecret } from "@/lib/secretBox";
import { activeAccess } from "@/lib/workspace";
import { parseBody, readJson } from "@/lib/validation";

// Tokens IA de la propia persona (solo con sesión de navegador). Se pueden tener varios, cada uno con su nombre.
export async function GET() {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  try {
    const [rows, logs] = await Promise.all([
      prisma.apiToken.findMany({ where: { userId: auth.user.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, allowDelete: true, workspaceId: true, tokenEnc: true } }),
      prisma.apiTokenLog.findMany({ where: { userId: auth.user.id }, orderBy: { createdAt: "desc" }, take: 30, select: { route: true, createdAt: true } }),
    ]);
    const ws = await prisma.workspace.findMany({ where: { id: { in: rows.map((r) => r.workspaceId).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
    const tokens = rows.map((r) => ({
      id: r.id,
      name: r.name,
      prefix: r.prefix,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt,
      allowDelete: r.allowDelete,
      workspaceName: ws.find((w) => w.id === r.workspaceId)?.name ?? null,
      canReveal: !!r.tokenEnc, // los creados antes de poder volver a copiarlos no se pueden recuperar
    }));
    return NextResponse.json({ tokens, logs });
  } catch (e) {
    return errorResponse(e);
  }
}

// Crea un token nuevo con nombre. El texto completo se devuelve ahora y se puede volver a copiar después.
export async function POST(req: Request) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const parsed = parseBody(z.object({ name: z.string().trim().min(1).max(40).optional(), allowDelete: z.boolean().optional() }), await readJson(req).catch(() => ({})));
  if ("error" in parsed) return parsed.error;
  try {
    if ((await prisma.apiToken.count({ where: { userId: auth.user.id } })) >= MAX_TOKENS_PER_USER) return NextResponse.json({ error: `Máximo ${MAX_TOKENS_PER_USER} tokens: revoca alguno que ya no uses` }, { status: 400 });
    // El token actúa solo dentro del equipo que está activo al crearlo.
    const access = await activeAccess(auth.user.id);
    if (!access) return NextResponse.json({ error: "No perteneces a ningún equipo" }, { status: 400 });
    const token = generateToken();
    const row = await prisma.apiToken.create({
      data: { userId: auth.user.id, tokenHash: hashToken(token), tokenEnc: encryptSecret(token), prefix: token.slice(0, 10), workspaceId: access.workspaceId, name: parsed.data.name ?? "Token", allowDelete: parsed.data.allowDelete === true },
      select: { id: true },
    });
    return NextResponse.json({ id: row.id, token, prefix: token.slice(0, 10) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
