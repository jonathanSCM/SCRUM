import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getBaseUrl } from "@/lib/baseUrl";
import { MAX_FAILURES, isPermanentFailure, toNtfyMessage, topicFrom, type NtfyInput } from "@/lib/scrum/ntfyFormat";

// Avisos al teléfono con ntfy (servidor propio). Se activa solo si están NTFY_BASE_URL y NTFY_PUBLISH_TOKEN.
// NUNCA lanza: un aviso caído no puede romper la acción que lo disparó.

const TIMEOUT_MS = 4000;

const server = () => (process.env.NTFY_BASE_URL ?? "").replace(/\/+$/, "");
export function ntfyConfigured(): boolean {
  return !!server() && !!process.env.NTFY_PUBLISH_TOKEN;
}
export const ntfyServerUrl = server;
export const newTopic = () => topicFrom(randomBytes(16).toString("hex"));

// Publica un mensaje en un tema. Devuelve el estado HTTP (0 si no hubo respuesta).
export async function publishNtfy(topic: string, input: NtfyInput, opts: { minimal: boolean }): Promise<{ ok: boolean; status: number; error?: string }> {
  if (!ntfyConfigured()) return { ok: false, status: 0, error: "Los avisos al teléfono no están configurados en el servidor" };
  try {
    const res = await fetch(server(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.NTFY_PUBLISH_TOKEN}` },
      body: JSON.stringify(toNtfyMessage(topic, input, { minimal: opts.minimal, baseUrl: getBaseUrl() })),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { ok: res.ok, status: res.status, error: res.ok ? undefined : `ntfy respondió ${res.status}` };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.name : "sin respuesta" };
  }
}

// Avisa a esas personas (o a todas con canal activo si userIds es null). Lleva la cuenta de fallos y desactiva
// el canal tras varios seguidos con un error permanente (tema o permiso inexistente).
export async function notifyNtfy(userIds: string[] | null, input: NtfyInput): Promise<number> {
  try {
    if (!ntfyConfigured()) return 0;
    if (userIds && userIds.length === 0) return 0;
    const channels = await prisma.ntfyChannel.findMany({ where: { enabled: true, ...(userIds ? { userId: { in: userIds } } : {}) } });
    let sent = 0;
    await Promise.allSettled(
      channels.map(async (c) => {
        const r = await publishNtfy(c.topic, input, { minimal: c.minimal });
        if (r.ok) {
          sent++;
          if (c.failures > 0 || !c.lastOkAt || Date.now() - c.lastOkAt.getTime() > 60_000) await prisma.ntfyChannel.update({ where: { id: c.id }, data: { failures: 0, lastError: null, lastOkAt: new Date() } });
          return;
        }
        // Un fallo temporal (sin respuesta, 5xx, 429) no cuenta; uno permanente sí.
        if (isPermanentFailure(r.status)) {
          const failures = c.failures + 1;
          await prisma.ntfyChannel.update({ where: { id: c.id }, data: { failures, lastError: r.error ?? "error", ...(failures >= MAX_FAILURES ? { enabled: false } : {}) } });
        } else {
          await prisma.ntfyChannel.update({ where: { id: c.id }, data: { lastError: r.error ?? "error" } }).catch(() => {});
        }
      })
    );
    return sent;
  } catch (err) {
    console.error("[ntfy] no se pudo avisar:", err);
    return 0;
  }
}
