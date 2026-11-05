"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { ROLE_LABEL, type WsRole } from "@/lib/scrum/roles";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toaster";

export type TeamOption = { id: string; name: string; role: WsRole };

// Selector de equipo de la barra superior: cambia el equipo activo o crea uno nuevo.
export default function TeamSwitcher({ teams, activeId, canCreate, maxOwned }: { teams: TeamOption[]; activeId: string; canCreate: boolean; maxOwned: number }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = teams.find((t) => t.id === activeId) ?? teams[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function switchTo(id: string) {
    setOpen(false);
    if (id === activeId) return;
    const res = await api("/api/workspaces/active", "POST", { workspaceId: id });
    if (!res.ok) return toast.error(res.error);
    // Se vuelve al inicio del equipo elegido: lo que se estaba mirando era del equipo anterior.
    window.location.assign("/home");
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await api("/api/workspaces", "POST", { name });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    window.location.assign("/home");
  }

  if (!active) return null;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Cambiar de equipo"
        className="flex max-w-[11rem] items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm font-semibold text-ink hover:border-rust"
      >
        <span className="truncate">{active.name}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-50 mt-2 w-64 rounded-lg border border-line bg-card shadow-hard-lg">
          <p className="border-b border-line-strong px-3 py-2 text-xs font-bold text-ink-faint">Tus equipos</p>
          <ul className="max-h-64 overflow-y-auto py-1">
            {teams.map((t) => (
              <li key={t.id}>
                <button role="menuitem" onClick={() => switchTo(t.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-card-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${t.id === activeId ? "bg-moss" : "bg-transparent"}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-ink">{t.name}</span>
                  <span className="shrink-0 text-[10px] font-bold uppercase text-ink-faint">{ROLE_LABEL[t.role]}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-line-strong p-2">
            {canCreate ? (
              <button
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setCreating(true);
                }}
                className="w-full rounded-md px-2 py-1.5 text-left text-sm font-semibold text-rust hover:bg-card-2"
              >
                + Crear un equipo nuevo
              </button>
            ) : (
              <p className="px-2 py-1 text-xs text-ink-faint">Ya sos dueño de {maxOwned} equipos (el máximo).</p>
            )}
          </div>
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Crear un equipo"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>Cancelar</button>
            <button type="submit" form="create-team-form" className="btn-primary" disabled={busy || name.trim().length < 2}>{busy ? "Creando…" : "Crear equipo"}</button>
          </>
        }
      >
        <form id="create-team-form" onSubmit={create} className="space-y-3">
          <p className="text-sm text-ink-soft">Vas a ser el dueño. Después invitas a quien quieras por email, con el rol que elijas.</p>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Nombre del equipo</label>
            <input data-autofocus className="field" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Ej: Mi agencia" />
          </div>
        </form>
      </Modal>
    </div>
  );
}
