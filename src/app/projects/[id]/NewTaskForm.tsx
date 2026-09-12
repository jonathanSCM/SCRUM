"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TYPE_LABEL, PRIORITY_LABEL } from "@/lib/taskLabels";

const TYPE_OPTIONS = Object.entries(TYPE_LABEL);
const PRIORITY_OPTIONS = Object.entries(PRIORITY_LABEL);

export default function NewTaskForm({
  projectId,
  members,
}: {
  projectId: string;
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("CAMBIO_PENDIENTE");
  const [priority, setPriority] = useState("MEDIA");
  const [assigneeId, setAssigneeId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, type, priority, assigneeId: assigneeId || undefined }),
    });

    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "No se pudo crear la tarea");
      return;
    }

    setTitle("");
    setType("CAMBIO_PENDIENTE");
    setPriority("MEDIA");
    setAssigneeId("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-ghost">
        + Nueva tarea
      </button>
    );
  }

  return (
    <form
      onSubmit={create}
      className="flex flex-wrap items-center gap-2 border border-line bg-card p-3.5 rounded-xl2 backdrop-blur-md shadow-[0_20px_45px_-20px_rgba(0,0,0,0.7)]"
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título de la tarea"
        autoFocus
        className="field min-w-[200px] flex-1"
      />
      <select value={priority} onChange={(e) => setPriority(e.target.value)} className="field !w-auto py-1 text-xs">
        {PRIORITY_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <select value={type} onChange={(e) => setType(e.target.value)} className="field !w-auto py-1 text-xs">
        {TYPE_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="field !w-auto py-1 text-xs">
        <option value="">Sin encargado</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <button type="submit" disabled={saving || !title.trim()} className="btn-primary !py-1.5 !text-xs">
        {saving ? "Creando..." : "Crear"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="btn-ghost !py-1.5 !text-xs">
        Cancelar
      </button>
      {error && <p className="w-full text-sm font-medium text-danger">{error}</p>}
    </form>
  );
}
