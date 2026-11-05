"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { buildAiAccessPrompt } from "@/lib/aiPrompt";
import { timeAgo } from "@/lib/ui";
import { useToast } from "@/components/ui/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";

type TokenInfo = { prefix: string; createdAt: string; lastUsedAt: string | null } | null;
type LogRow = { route: string; createdAt: string };

// Mi perfil → Token IA: para que un asistente (Claude) cargue proyectos en tu nombre.
export default function AiTokenCard({ userName }: { userName: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [info, setInfo] = useState<TokenInfo>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null); // token en claro: solo existe justo después de crearlo
  const [showLogs, setShowLogs] = useState(false);

  async function load() {
    const res = await api<{ token: TokenInfo; logs: LogRow[] }>("/api/tokens");
    if (res.ok) {
      setInfo(res.data.token);
      setLogs(res.data.logs);
    }
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  async function generate() {
    if (info && !(await confirm("Ya tenés un token. Generar uno nuevo invalida el anterior y lo que lo use deja de funcionar. ¿Seguimos?", { confirmLabel: "Generar nuevo" }))) return;
    setBusy(true);
    const res = await api<{ token: string }>("/api/tokens", "POST", {});
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setFresh(res.data.token);
    await load();
  }

  async function revoke() {
    if (!(await confirm("¿Revocar el token? Lo que lo use dejará de funcionar.", { confirmLabel: "Revocar", danger: true }))) return;
    setBusy(true);
    const res = await api("/api/tokens", "DELETE");
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setFresh(null);
    setLogs([]);
    await load();
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copiado`);
    } catch {
      toast.error("No se pudo copiar. Seleccionalo y copialo a mano.");
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-line bg-card p-5">
      <h2 className="font-display text-lg font-extrabold text-ink">Token IA</h2>
      <p className="text-sm text-ink-soft">
        Dale este token a tu asistente (Claude) para que lea tus proyectos y cargue épicas, historias, tareas y notas por vos, sin crear todo a mano.
        Lo que haga queda registrado a tu nombre, con tus mismos permisos. No puede borrar nada ni iniciar o completar sprints.
      </p>

      {loading ? (
        <div className="skeleton h-10 w-full" />
      ) : !info ? (
        <button className="btn-primary btn-sm" disabled={busy} onClick={generate}>Generar token</button>
      ) : (
        <div className="space-y-3">
          {fresh ? (
            <div className="space-y-2 rounded-md border border-moss bg-card-2 p-3">
              <p className="text-xs font-semibold text-ink">Copialo ahora: por seguridad no se vuelve a mostrar.</p>
              <code className="block overflow-x-auto whitespace-nowrap rounded border border-line-strong bg-paper px-2 py-1.5 text-xs text-ink">{fresh}</code>
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary btn-sm" onClick={() => copy(buildAiAccessPrompt(window.location.origin, fresh, userName), "Prompt")}>Copiar prompt para Claude</button>
                <button className="btn-ghost btn-sm" onClick={() => copy(fresh, "Token")}>Copiar solo el token</button>
              </div>
              <p className="text-xs text-ink-faint">El prompt ya incluye el token y las instrucciones: pegáselo a Claude y listo.</p>
            </div>
          ) : (
            <p className="text-xs text-ink-soft">
              Token activo <span className="font-mono text-ink">{info.prefix}…</span> · creado {timeAgo(info.createdAt)} ·{" "}
              {info.lastUsedAt ? `último uso ${timeAgo(info.lastUsedAt)}` : "todavía sin usar"}. Si lo perdiste, generá uno nuevo.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost btn-sm" disabled={busy} onClick={generate}>Generar nuevo</button>
            <button className="btn-ghost btn-sm text-danger" disabled={busy} onClick={revoke}>Revocar</button>
            <button className="btn-ghost btn-sm" onClick={() => setShowLogs((v) => !v)} aria-expanded={showLogs}>
              {showLogs ? "Ocultar actividad" : "Ver actividad del token"}
            </button>
          </div>
          {showLogs && (
            <div className="rounded-md border border-line bg-paper-deep p-2">
              <p className="mb-1 text-[11px] text-ink-faint">Solo lo ves vos. No aparece en el historial de los proyectos.</p>
              {logs.length === 0 ? (
                <p className="text-xs text-ink-faint">Todavía no se usó.</p>
              ) : (
                <ul className="max-h-48 space-y-0.5 overflow-y-auto font-mono text-[11px] text-ink-soft">
                  {logs.map((l, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="truncate">{l.route}</span>
                      <span className="shrink-0 text-ink-faint">{timeAgo(l.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
