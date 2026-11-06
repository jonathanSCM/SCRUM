import "server-only";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

export const TOKEN_PREFIX = "scrum_";

export function generateToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(24).toString("hex")}`;
}

// El token es aleatorio de alta entropía: con SHA-256 alcanza (no hace falta bcrypt).
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type TokenOwner = { id: string; name: string; email: string; workspaceId: string | null; allowDelete: boolean };

const TOUCH_EVERY_MS = 60_000;
const KEEP_LOGS = 200;

// Valida el token y devuelve a su dueño; si no existe o fue revocado, null.
// Anota el uso (último uso + registro privado) sin hacer esperar la petición.
export async function resolveApiToken(token: string, route: string | null): Promise<TokenOwner | null> {
  if (!token.startsWith(TOKEN_PREFIX) || token.length > 200) return null;
  const row = await prisma.apiToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!row) return null;

  const now = Date.now();
  if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
    void prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  if (route) {
    void prisma.apiTokenLog
      .create({ data: { userId: row.userId, route: route.slice(0, 200) } })
      .then(async () => {
        const count = await prisma.apiTokenLog.count({ where: { userId: row.userId } });
        if (count > KEEP_LOGS + 100) {
          const cutoff = await prisma.apiTokenLog.findMany({ where: { userId: row.userId }, orderBy: { createdAt: "desc" }, skip: KEEP_LOGS, take: 1, select: { createdAt: true } });
          if (cutoff[0]) await prisma.apiTokenLog.deleteMany({ where: { userId: row.userId, createdAt: { lte: cutoff[0].createdAt } } });
        }
      })
      .catch(() => {});
  }
  // El token solo actúa en su equipo; si es uno antiguo sin equipo, en el más antiguo de su dueño.
  let workspaceId = row.workspaceId;
  if (!workspaceId) {
    const first = await prisma.membership.findFirst({ where: { userId: row.userId }, orderBy: { createdAt: "asc" }, select: { workspaceId: true } });
    workspaceId = first?.workspaceId ?? null;
  }
  return { id: row.user.id, name: row.user.name, email: row.user.email, workspaceId, allowDelete: row.allowDelete };
}
