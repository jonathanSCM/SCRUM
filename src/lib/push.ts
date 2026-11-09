import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { notifyNtfy } from "@/lib/ntfy";
import type { NtfyPriority } from "@/lib/scrum/ntfyFormat";

// Notificaciones push del navegador (Web Push + VAPID). Se activan solo si
// están VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY; si no, todo esto es un no-op.
// NUNCA lanza: un push caído no puede romper la acción que lo disparó.

export type PushPayload = { title: string; body: string; url?: string; tag?: string; priority?: NtfyPriority };

export function pushConfigured(): boolean {
  return !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

let configured = false;
function setup(): boolean {
  if (!pushConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@proshop.lat", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
    configured = true;
  }
  return true;
}

// Quita el marcado de negritas (**x**) y recorta para la notificación.
export function buildPushPayload(message: { title: string; description: string; url?: string }, fallbackUrl: string): PushPayload {
  const clean = (s: string, max: number) => {
    const t = s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\s+/g, " ").trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  };
  return { title: clean(message.title, 80), body: clean(message.description, 160), url: message.url ?? fallbackUrl };
}

// Manda el push a los dispositivos de esos usuarios (o de todos si userIds es null).
export async function sendPush(userIds: string[] | null, payload: PushPayload): Promise<number> {
  // El teléfono (ntfy) recibe el mismo aviso, aunque el push del navegador no esté configurado.
  void notifyNtfy(userIds, payload);
  try {
    if (!setup()) return 0;
    if (userIds && userIds.length === 0) return 0;
    const subs = await prisma.pushSubscription.findMany({ where: userIds ? { userId: { in: userIds } } : {} });
    let sent = 0;
    const body = JSON.stringify(payload);
    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 24 });
          sent++;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // El navegador ya no acepta esta suscripción (desinstalada / permiso revocado).
          if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
          else console.error("[push] error enviando:", status ?? "desconocido");
        }
      })
    );
    return sent;
  } catch (err) {
    console.error("[push] no se pudo preparar el envío:", err);
    return 0;
  }
}
