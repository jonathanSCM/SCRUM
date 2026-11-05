"use client";

import { useEffect } from "react";

// Si abriste un proyecto de otro de tus equipos (enlace directo), cambia el equipo activo
// para que el resto de la app (panel de tickets, chat, navbar) use el equipo correcto.
export default function WorkspaceSync({ workspaceId }: { workspaceId: string }) {
  useEffect(() => {
    fetch("/api/workspaces/active", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId }) })
      .then((r) => r.ok && window.location.reload())
      .catch(() => {});
  }, [workspaceId]);
  return null;
}
