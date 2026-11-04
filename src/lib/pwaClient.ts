"use client";

// Utilidades del navegador para la PWA y las notificaciones push.

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

// La clave VAPID viaja en base64url; PushManager la pide como bytes.
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

// Pide permiso (hay que llamarla desde un clic) y suscribe este dispositivo.
export async function subscribeToPush(publicKey: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!pushSupported()) return { ok: false, error: "Este navegador no admite notificaciones push. En iPhone hay que instalar la app en la pantalla de inicio primero." };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, error: "No diste permiso de notificaciones. Podés activarlo desde los ajustes del sitio en tu navegador." };
  try {
    const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await registerServiceWorker());
    if (!reg) return { ok: false, error: "No se pudo registrar el service worker." };
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
    const json = sub.toJSON();
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
    if (!res.ok) return { ok: false, error: "El servidor no pudo guardar la suscripción." };
    return { ok: true };
  } catch {
    // Pasa si el navegador no puede contactar su servicio push (sin internet, bloqueado por la red o por el navegador).
    return { ok: false, error: "El navegador no pudo suscribirse al servicio de notificaciones. Revisá tu conexión e intentá de nuevo." };
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
