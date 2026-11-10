"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Mantiene una pantalla al día: cada `everyMs` pregunta por la "versión" de los datos
// (consulta liviana) y, si cambió, recarga la vista. No consulta con la pestaña oculta
// y se pausa mientras `paused` (por ejemplo, arrastrando una tarjeta).
export function useLiveRefresh(url: string, { paused = false, everyMs = 3000 }: { paused?: boolean; everyMs?: number } = {}) {
  const router = useRouter();
  const known = useRef<string | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    let busy = false;
    let stopped = false;
    async function check() {
      if (busy || stopped || pausedRef.current || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;
        const { v } = (await res.json()) as { v: string };
        if (known.current !== null && known.current !== v) router.refresh();
        known.current = v;
      } catch {
        /* sin conexión: se reintenta en el próximo ciclo */
      } finally {
        busy = false;
      }
    }
    void check();
    const timer = setInterval(check, everyMs);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [url, everyMs, router]);
}
