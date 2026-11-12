import { badgeCount, titleWithBadge } from "@/lib/scrum/movement";

// Pone (o quita) el número de avisos sin leer sobre el icono de la app instalada (Badging API) y en el título de la pestaña.
// Donde el navegador no la soporta (por ejemplo, una pestaña normal en algunos navegadores) no hace nada.
export function applyUnreadBadge(unread: number): void {
  if (typeof window === "undefined") return;
  const n = badgeCount(unread);
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (n > 0) void nav.setAppBadge?.(n)?.catch(() => {});
    else void nav.clearAppBadge?.()?.catch(() => {});
  } catch {}
  // document.title ya viene sin espacios sobrantes: se compara igual para no reescribirlo sin fin.
  const next = titleWithBadge(document.title, unread).replace(/\s+/g, " ").trim();
  if (next !== document.title) document.title = next;
}
