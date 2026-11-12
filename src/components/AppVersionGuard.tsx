"use client";

import { useCallback, useEffect, useState } from "react";
import { decideVersionAction } from "@/lib/scrum/appVersion";

const KEY = "app-cache-version";

// Borra lo que el navegador guardó de la app (Cache Storage) y pide al service worker que se actualice.
// No se desinstala el service worker: así no se pierde la suscripción a los avisos del teléfono.
async function purgeCaches() {
  try {
    if ("caches" in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(regs.map((r) => r.update().catch(() => {})));
  } catch {}
}

const isTyping = () => {
  const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  return !!el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT") && !!el.value;
};

// Mantiene al día cada dispositivo: avisa cuando hay una versión nueva y limpia el caché cuando se sube CACHE_VERSION.
// clientBuild: la compilación con la que el servidor armó esta página (la que tiene cargada esta pestaña).
export default function AppVersionGuard({ clientBuild }: { clientBuild: string }) {
  const [banner, setBanner] = useState(false);

  const check = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const res = await fetch("/api/app-version", { cache: "no-store" });
      if (!res.ok) return;
      const v = (await res.json()) as { build: string; cache: string };
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(KEY);
      } catch {}
      const action = decideVersionAction({ storedCache: stored, serverCache: v.cache, serverBuild: v.build, clientBuild, typing: isTyping() });
      if (action === "remember" || action === "purge-reload" || action === "purge-banner") {
        try {
          localStorage.setItem(KEY, v.cache);
        } catch {}
      }
      if (action === "purge-reload" || action === "purge-banner") await purgeCaches();
      if (action === "purge-reload") location.reload();
      else if (action === "purge-banner" || action === "banner") setBanner(true);
    } catch {}
  }, [clientBuild]);

  useEffect(() => {
    void check();
    const t = setInterval(check, 10 * 60_000);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  if (!banner) return null;
  return (
    <div role="status" className="fixed left-1/2 top-3 z-[70] flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-line-strong bg-card px-4 py-2.5 shadow-hard">
      <p className="text-sm text-ink">Hay una versión nueva de la app.</p>
      <button className="btn-primary btn-sm shrink-0" onClick={() => location.reload()}>Actualizar</button>
    </div>
  );
}
