"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { applyUnreadBadge } from "@/lib/appBadge";

// Campana con el número de avisos sin leer (se actualiza cada minuto y al cambiar de página).
export default function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    let alive = true;
    async function load() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/notifications?limit=1", { cache: "no-store" });
        if (res.ok && alive) {
          const n = (await res.json()).unread ?? 0;
          setUnread(n);
          applyUnreadBadge(n);
        }
      } catch {}
    }
    void load();
    const t = setInterval(load, 60_000);
    window.addEventListener("notifs-changed", load);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("notifs-changed", load);
    };
  }, [pathname]);

  // Next cambia el título al navegar: se vuelve a poner el "(3)" delante.
  useEffect(() => {
    const el = document.querySelector("title");
    if (!el) return;
    const obs = new MutationObserver(() => applyUnreadBadge(unread));
    obs.observe(el, { childList: true, characterData: true, subtree: true });
    applyUnreadBadge(unread);
    return () => obs.disconnect();
  }, [unread, pathname]);

  return (
    <Link href="/notifications" aria-label={unread ? `Avisos: ${unread} sin leer` : "Avisos"} className="relative flex h-9 w-9 items-center justify-center rounded-md border border-line text-ink-soft hover:text-ink">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
      {unread > 0 && <span className="absolute -right-1.5 -top-1.5 min-w-[1.1rem] rounded-full bg-rust px-1 text-center text-[10px] font-bold leading-[1.1rem] text-white">{unread > 99 ? "99+" : unread}</span>}
    </Link>
  );
}
