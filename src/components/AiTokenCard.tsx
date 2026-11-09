"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { buildAiAccessPrompt } from "@/lib/aiPrompt";
import { timeAgo } from "@/lib/ui";
import { useToast } from "@/components/ui/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";

type TokenInfo = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null; allowDelete: boolean; workspaceName: string | null; canReveal: boolean };
type LogRow = { route: string; createdAt: string };

// Ajustes → Token IA: para que un asistente (Claude, ChatGPT…) lea y cargue proyectos en tu nombre.
// Puedes tener varios tokens con nombre y volver a copiar el prompt (con el token) cuando quieras.
export default function AiTokenCard({ userName }: { userName: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [wantDelete, setWantDelete] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  async function load() {
    const res = await api<{ tokens: TokenInfo[]; logs: LogRow[] }>("/api/tokens");
    if (res.ok) {
      setTokens(res.data.tokens);
      setLogs(res.data.logs);
    }
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copiado`);
    } catch {
      toast.error("No se pudo copiar. Inténtalo de nuevo.");
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await api<{ id: string; token: string }>("/api/tokens", "POST", { name: name.trim() || undefined, allowDelete: wantDelete });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setName("");
    setWantDelete(false);
    await load();
    // Se copia el prompt completo de inmediato (también se puede volver a copiar después).
    await copy(buildAiAccessPrompt(window.location.origin, res.data.token, userName, wantDelete), "Prompt con el token");
  }

  // Trae el token (solo su dueño, con su sesión) y copia el prompt o solo el token.
  async function copyFor(t: TokenInfo, what: "prompt" | "token") {
    const res = await api<{ token: string; allowDelete: boolean }>(`/api/tokens/${t.id}/reveal`);
    if (!res.ok) return toast.error(res.error);
    await copy(what === "prompt" ? buildAiAccessPrompt(window.location.origin, res.data.token, userName, res.data.allowDelete) : res.data.token, what === "prompt" ? "Prompt con el token" : "Token");
  }

  async function regenerate(t: TokenInfo) {
    if (!(await confirm(`Regenerar "${t.name}" cambia su valor: lo que use el anterior dejará de funcionar. ¿Seguimos?`, { confirmLabel: "Regenerar" }))) return;
    setBusy(true);
    const res = await api<{ token: string }>(`/api/tokens/${t.id}/regenerate`, "POST");
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    await load();
    await copy(buildAiAccessPrompt(window.location.origin, res.data.token, userName, t.allowDelete), "Prompt con el token nuevo");
  }

  async function rename(t: TokenInfo) {
    const next = window.prompt("Nombre del token", t.name)?.trim();
    if (!next || next === t.name) return;
    const res = await api(`/api/tokens/${t.id}`, "PATCH", { name: next });
    if (!res.ok) return toast.error(res.error);
    await load();
  }

  async function toggleDelete(t: TokenInfo, next: boolean) {
    if (next && !(await confirm("Con esto el asistente podrá borrar tickets, notas y comentarios (nunca proyectos ni sprints). Actívalo solo para una limpieza puntual y desactívalo después. ¿Activar?", { confirmLabel: "Activar borrado", danger: true }))) return;
    const res = await api(`/api/tokens/${t.id}`, "PATCH", { allowDelete: next });
    if (!res.ok) return toast.error(res.error);
    toast.success(next ? "El token ahora puede borrar" : "El token ya no puede borrar");
    await load();
  }

  async function revoke(t: TokenInfo) {
    if (!(await confirm(`¿Revocar "${t.name}"? Lo que lo use dejará de funcionar.`, { confirmLabel: "Revocar", danger: true }))) return;
    const res = await api(`/api/tokens/${t.id}`, "DELETE");
    if (!res.ok) return toast.error(res.error);
    await load();
  }

  return (
    <section className="space-y-4 rounded-lg border border-line bg-card p-5">
      <h2 className="font-display text-lg font-extrabold text-ink">Tokens IA</h2>
      <p className="text-sm text-ink-soft">
        Dale un token a tu asistente (Claude, ChatGPT…) para que lea tus proyectos y cargue épicas, historias, tareas y notas por ti. Lo que haga queda registrado a tu nombre, con tus mismos permisos.
        Puedes tener varios (uno por asistente) y volver a copiar el prompt cuando quieras. Nunca puede iniciar ni completar sprints, ni borrar proyectos.
      </p>

      {loading ? (
        <div className="skeleton h-10 w-full" />
      ) : (
        <>
          {tokens.length === 0 && <p className="text-sm text-ink-faint">Todavía no tienes ningún token.</p>}
          <ul className="space-y-3">
            {tokens.map((t) => (
              <li key={t.id} className="space-y-2 rounded-md border border-line-strong p-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-ink">{t.name}</span>
                  <span className="font-mono text-xs text-ink-faint">{t.prefix}…</span>
                  <span className="text-xs text-ink-faint">
                    {t.workspaceName ? `equipo ${t.workspaceName} · ` : ""}creado {timeAgo(t.createdAt)} · {t.lastUsedAt ? `último uso ${timeAgo(t.lastUsedAt)}` : "sin usar"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {t.canReveal ? (
                    <>
                      <button className="btn-primary btn-sm" onClick={() => copyFor(t, "prompt")}>Copiar prompt con el token</button>
                      <button className="btn-ghost btn-sm" onClick={() => copyFor(t, "token")}>Copiar solo el token</button>
                    </>
                  ) : (
                    <button className="btn-primary btn-sm" disabled={busy} onClick={() => regenerate(t)}>Regenerar y copiar prompt</button>
                  )}
                  <button className="btn-ghost btn-sm" onClick={() => rename(t)}>Renombrar</button>
                  {t.canReveal && <button className="btn-ghost btn-sm" disabled={busy} onClick={() => regenerate(t)}>Regenerar</button>}
                  <button className="btn-ghost btn-sm text-danger" onClick={() => revoke(t)}>Revocar</button>
                </div>
                {!t.canReveal && <p className="text-xs text-ink-faint">Este token se creó antes de poder volver a copiarlo: regénéralo una vez y desde ahí podrás copiarlo siempre.</p>}
                <label className="flex items-start gap-2 text-sm text-ink-soft">
                  <input type="checkbox" className="mt-1" checked={t.allowDelete} onChange={(e) => void toggleDelete(t, e.target.checked)} />
                  <span>Permitir que borre tickets, notas y comentarios <span className="text-ink-faint">(no proyectos ni sprints). Actívalo solo cuando lo necesites.</span></span>
                </label>
              </li>
            ))}
          </ul>

          <form onSubmit={create} className="space-y-2 rounded-md border border-dashed border-line-strong p-3">
            <p className="text-sm font-semibold text-ink">Crear un token nuevo</p>
            <div className="flex flex-wrap gap-2">
              <input className="field min-w-0 flex-1" placeholder="Nombre (ej. Claude, ChatGPT de Mariana)" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
              <button className="btn-primary" disabled={busy}>Crear y copiar prompt</button>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" checked={wantDelete} onChange={(e) => setWantDelete(e.target.checked)} /> Permitir que borre tickets, notas y comentarios
            </label>
          </form>

          <div>
            <button className="btn-ghost btn-sm" onClick={() => setShowLogs((v) => !v)} aria-expanded={showLogs}>{showLogs ? "Ocultar actividad" : "Ver actividad de los tokens"}</button>
            {showLogs && (
              <div className="mt-2 rounded-md border border-line bg-paper-deep p-2">
                <p className="mb-1 text-[11px] text-ink-faint">Solo lo ves tú. No aparece en el historial de los proyectos.</p>
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
        </>
      )}
    </section>
  );
}
