"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewProjectForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });

    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "No se pudo crear el proyecto");
      return;
    }

    setName("");
    setDescription("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary mb-6">
        + Nuevo proyecto
      </button>
    );
  }

  return (
    <form
      onSubmit={create}
      className="mb-6 flex flex-wrap items-start gap-2 border border-line bg-card p-3.5 rounded-xl2 shadow-[6px_6px_0_var(--moss)]"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre del proyecto"
        autoFocus
        className="field min-w-[200px] flex-1"
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Descripción (opcional)"
        className="field min-w-[240px] flex-1"
      />
      <button type="submit" disabled={saving || !name.trim()} className="btn-primary">
        {saving ? "Creando..." : "Crear"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
        Cancelar
      </button>
      {error && <p className="w-full text-sm font-medium text-danger">{error}</p>}
    </form>
  );
}
