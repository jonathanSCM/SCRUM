"use client";

import { useEffect, useRef, useState } from "react";
import { isDriveUrl } from "@/lib/scrum/driveTitle";

// Al pegar un enlace de Google Drive rellena solo el nombre del documento (si la persona no escribió uno propio).
// Si la persona edita el nombre, no se vuelve a pisar. Devuelve `loading` para mostrar "Buscando el nombre…".
export function useDriveTitle(url: string, title: string, setTitle: (t: string) => void): boolean {
  const [loading, setLoading] = useState(false);
  const auto = useRef(""); // el último nombre puesto automáticamente
  const latest = useRef({ title, setTitle });
  latest.current = { title, setTitle };

  useEffect(() => {
    const clean = url.trim();
    if (!clean || !isDriveUrl(/^https?:\/\//i.test(clean) ? clean : `https://${clean}`)) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const cur = latest.current.title;
      if (cur !== "" && cur !== auto.current) return; // ya escribió su propio nombre
      setLoading(true);
      try {
        const r = await fetch(`/api/link-title?url=${encodeURIComponent(clean)}`);
        const json = (await r.json().catch(() => null)) as { title?: string | null } | null;
        const now = latest.current.title;
        if (!cancelled && json?.title && (now === "" || now === auto.current)) {
          auto.current = json.title;
          latest.current.setTitle(json.title);
        }
      } catch {
        /* sin red o sin permiso: se escribe a mano */
      }
      if (!cancelled) setLoading(false);
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [url]);

  return loading;
}
