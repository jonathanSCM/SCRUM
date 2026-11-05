import "server-only";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/scrum/roles";

// Busca una cuenta por email sin distinguir mayúsculas (así "Ana@x.com" y "ana@x.com" son la misma persona).
// PostgreSQL (producción) usa `mode: "insensitive"`; SQLite (desarrollo) ya compara sin distinguir en ASCII.
const insensitive = (process.env.DATABASE_URL ?? "").startsWith("postgres");

export async function findUserByEmail(email: string) {
  const norm = normalizeEmail(email);
  const where = insensitive ? ({ email: { equals: norm, mode: "insensitive" } } as never) : { email: norm };
  return prisma.user.findFirst({ where });
}
