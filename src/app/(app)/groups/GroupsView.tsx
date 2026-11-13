"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { timeAgo } from "@/lib/ui";
import { STATUSES, STATUS_META } from "@/lib/scrum/constants";
import type { GroupSummary } from "@/lib/groups";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toaster";

type Person = { id: string; name: string };

export default function GroupsView({ active, archived, people }: { active: GroupSummary[]; archived: GroupSummary[]; people: Person[] }) {
  const router = useRouter();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [members, setMembers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await api<{ id: string }>("/api/groups", "POST", { name, isPrivate, memberIds: isPrivate ? members : [] });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Grupo creado");
    router.push(`/projects/${res.data.id}/board`);
    router.refresh();
  }

  const list = showArchived ? archived : active;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary btn-sm" onClick={() => setCreating((v) => !v)}>+ Nuevo grupo</button>
        {archived.length > 0 && (
          <button className="btn-ghost btn-sm ml-auto" onClick={() => setShowArchived((v) => !v)}>{showArchived ? "Ver activos" : `Archivados (${archived.length})`}</button>
        )}
      </div>

      {creating && (
        <form onSubmit={create} className="space-y-3 rounded-lg border border-line bg-card p-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Nombre del grupo</label>
            <input className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Ej.: Demo cliente Acme" required />
          </div>
          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" className="mt-1" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
            <span><b>Privado</b><span className="block text-xs text-ink-faint">Por defecto lo ve todo el equipo. Si es privado, solo tú y las personas que elijas.</span></span>
          </label>
          {isPrivate && people.length > 0 && (
            <ul className="grid gap-1 sm:grid-cols-2">
              {people.map((p) => (
                <li key={p.id}>
                  <label className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-sm text-ink">
                    <input type="checkbox" checked={members.includes(p.id)} onChange={() => setMembers((m) => (m.includes(p.id) ? m.filter((x) => x !== p.id) : [...m, p.id]))} />
                    {p.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy || !name.trim()}>{busy ? "Creando…" : "Crear grupo"}</button>
            <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {list.length === 0 ? (
        <EmptyState title={showArchived ? "No hay grupos archivados" : "Todavía no hay grupos de tareas"} hint={showArchived ? "Los grupos archivados y los que ya se convirtieron en proyecto aparecen aquí." : "Crea uno para juntar tareas que aún no pertenecen a un proyecto."} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((g) => (
            <li key={g.id}>
              <Link href={`/projects/${g.id}/board`} className="lift block rounded-lg border border-line bg-card p-4">
                <div className="flex items-center gap-2">
                  {g.key && <span className="font-mono text-[11px] font-bold text-moss-ink">{g.key}</span>}
                  <span className="min-w-0 flex-1 truncate font-display text-base font-extrabold text-ink">{g.name}</span>
                  {g.isPrivate && <span className="lozenge text-warn" title="Privado">🔒</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {STATUSES.filter((s) => g.counts[s]).map((s) => (
                    <span key={s} className="lozenge" style={{ color: STATUS_META[s].color }}>{STATUS_META[s].label} {g.counts[s]}</span>
                  ))}
                  {g.total === 0 && <span className="text-xs text-ink-faint">Sin tareas</span>}
                </div>
                <p className="mt-2 font-mono text-[11px] text-ink-faint">
                  {g.convertedTo ? `Convertido en ${g.convertedTo.name}` : `${g.total} ${g.total === 1 ? "tarea" : "tareas"}`}
                  {g.ownerName ? ` · ${g.ownerName}` : ""} · {timeAgo(g.updatedAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
