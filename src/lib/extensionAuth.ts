import "server-only";
import { prisma } from "@/lib/prisma";
import { hashToken, TOKEN_PREFIX } from "@/lib/apiToken";
import { activeAccess } from "@/lib/workspace";

// Autenticación de la extensión de Chrome para Meet. Usa un token propio (scope EXTENSION) que solo sirve en
// /api/extension/*: no abre ninguna otra parte de la API. A su vez, un token IA no sirve acá.

export type ExtUser = { id: string; name: string; email: string };

export async function authExtension(req: Request): Promise<ExtUser | null> {
  const authz = req.headers.get("authorization") ?? "";
  if (!/^bearer\s/i.test(authz)) return null;
  const token = authz.replace(/^bearer\s+/i, "").trim();
  if (!token.startsWith(TOKEN_PREFIX) || token.length > 200) return null;
  const row = await prisma.apiToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { select: { id: true, name: true, email: true } } } });
  if (!row || row.scope !== "EXTENSION") return null;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) void prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return row.user;
}

// Equipos de la persona (la extensión los llama "organizaciones").
export async function teamsOf(userId: string) {
  const rows = await prisma.membership.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { role: true, workspace: { select: { id: true, name: true } } } });
  return rows.map((r) => ({ id: r.workspace.id, name: r.workspace.name, role: r.role }));
}

// Equipo al que va la reunión: el pedido (si la persona es de él), si no el activo, si no el primero.
export async function resolveTeam(userId: string, requested?: string | null): Promise<{ id: string; lead: boolean } | null> {
  const teams = await teamsOf(userId);
  if (teams.length === 0) return null;
  let chosen = requested ? teams.find((t) => t.id === requested) : undefined;
  if (requested && !chosen) return null; // pidió un equipo que no es suyo
  if (!chosen) {
    const active = await activeAccess(userId);
    chosen = teams.find((t) => t.id === active?.workspaceId) ?? teams[0];
  }
  return { id: chosen.id, lead: chosen.role === "OWNER" || chosen.role === "ADMIN" };
}
