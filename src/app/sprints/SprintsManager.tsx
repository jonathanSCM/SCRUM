"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useConfirm } from "@/components/ConfirmDialog";

type Sprint = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  total: number;
  done: number;
};

function fmt(d: string) {
  return new Date(d).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

export default function SprintsManager({ initialSprints }: { initialSprints: Sprint[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [sprints, setSprints] = useState(initialSprints);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function addSprint(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/sprints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, startDate, endDate }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "No se pudo crear el sprint");
      return;
    }
    const created = await res.json();
    setSprints((prev) => [{ ...created, total: 0, done: 0 }, ...prev]);
    setName("");
    setStartDate("");
    setEndDate("");
    setShowForm(false);
    router.refresh();
  }

  async function removeSprint(id: string, sprintName: string) {
    if (!(await confirm(`¿Borrar el sprint "${sprintName}"? Las tareas asignadas quedan sin sprint.`))) return;
    await fetch(`/api/sprints/${id}`, { method: "DELETE" });
    setSprints((prev) => prev.filter((s) => s.id !== id));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {showForm ? (
        <form onSubmit={addSprint} className="flex flex-wrap items-end gap-2 border border-line bg-card p-4 rounded-xl2 backdrop-blur-md">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Nombre</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className="field" placeholder="Sprint 1" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Inicio</label>
            <input required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="field" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Fin</label>
            <input required type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="field" />
          </div>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Creando..." : "Crear sprint"}
          </button>
          <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">
            Cancelar
          </button>
        </form>
      ) : (
        <button onClick={() => setShowForm(true)} className="btn-ghost">
          + Nuevo sprint
        </button>
      )}

      {error && <p className="text-sm font-medium text-danger">{error}</p>}

      {sprints.length === 0 ? (
        <p className="border border-dashed border-line-strong rounded-xl2 p-6 text-center text-sm text-ink-soft">
          Todavía no creaste ningún sprint.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {sprints.map((s) => (
            <li key={s.id} className="flex items-center justify-between border border-line bg-card p-4 rounded-xl2 backdrop-blur-md">
              <Link href={`/sprints/${s.id}`} className="min-w-0 flex-1">
                <p className="font-display text-sm font-semibold text-ink">{s.name}</p>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {fmt(s.startDate)} — {fmt(s.endDate)} · {s.done}/{s.total} completadas
                </p>
              </Link>
              <button onClick={() => removeSprint(s.id, s.name)} className="text-xs text-ink-faint hover:text-danger">
                Borrar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
