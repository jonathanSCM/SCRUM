import "server-only";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secretBox";

// Claves de terceros por equipo. Cada equipo usa SOLO las suyas.
// Compatibilidad: las variables de entorno (GEMINI_API_KEY, SLACK_BOT_TOKEN) siguen valiendo, pero
// solo para el equipo más antiguo (el original) o los equipos listados en ENV_KEYS_WORKSPACES
// (slugs separados por coma). Así un equipo nuevo nunca gasta la clave del servidor.
async function envAllowed(workspaceId: string): Promise<boolean> {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { slug: true } });
  if (!ws) return false;
  const listed = (process.env.ENV_KEYS_WORKSPACES ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (listed.length) return listed.includes(ws.slug);
  const oldest = await prisma.workspace.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  return oldest?.id === workspaceId;
}

async function resolve(workspaceId: string | null, field: "geminiKeyEnc" | "slackBotEnc" | "slackWebhookEnc", envName: string): Promise<string | null> {
  if (!workspaceId) return null;
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { geminiKeyEnc: true, slackBotEnc: true, slackWebhookEnc: true } });
  const own = decryptSecret(ws?.[field]);
  if (own) return own;
  const env = process.env[envName];
  return env && (await envAllowed(workspaceId)) ? env : null;
}

export const geminiKeyFor = (workspaceId: string | null) => resolve(workspaceId, "geminiKeyEnc", "GEMINI_API_KEY");
export const slackBotTokenFor = (workspaceId: string | null) => resolve(workspaceId, "slackBotEnc", "SLACK_BOT_TOKEN");

// Webhook de Slack del equipo: solo el propio (sin respaldo del servidor).
export async function teamSlackWebhookFor(workspaceId: string | null): Promise<string | null> {
  if (!workspaceId) return null;
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { slackWebhookEnc: true } });
  return decryptSecret(ws?.slackWebhookEnc);
}
