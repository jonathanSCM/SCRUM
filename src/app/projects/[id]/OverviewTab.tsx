"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Status = { id: string; name: string; color: string };
type Member = { id: string; name: string };

export default function OverviewTab({
  projectId,
  statusId: initialStatusId,
  assigneeId: initialAssigneeId,
  description: initialDescription,
  deployUrl: initialDeployUrl,
  stack: initialStack,
  statuses,
}: {
  projectId: string;
  statusId: string;
  assigneeId: string | null;
  description: string;
  deployUrl: string | null;
  stack: string;
  statuses: Status[];
}) {
  const router = useRouter();
  const [statusId, setStatusId] = useState(initialStatusId);
  const [assigneeId, setAssigneeId] = useState(initialAssigneeId ?? "");
  const [description, setDescription] = useState(initialDescription);
  const [deployUrl, setDeployUrl] = useState(initialDeployUrl ?? "");
  const [members, setMembers] = useState<Member[]>([]);
  const [stack, setStack] = useState<string[]>(() => {
    try {
      return JSON.parse(initialStack);
    } catch {
      return [];
    }
  });
  const [stackInput, setStackInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/team-members")
      .then((res) => res.json())
      .then(setMembers)
      .catch(() => {});
  }, []);

  function addStackItem() {
    const value = stackInput.trim();
    if (!value) return;
    setStack((prev) => [...prev, value]);
    setStackInput("");
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        statusId,
        assigneeId: assigneeId || null,
        description,
        deployUrl: deployUrl || null,
        stack,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "No se pudo guardar");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Estado</label>
          <select value={statusId} onChange={(e) => setStatusId(e.target.value)} className="field">
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Encargado</label>
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="field">
            <option value="">Sin encargado</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Descripción</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="field" />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Link de despliegue (donde está corriendo el proyecto)
        </label>
        <input
          value={deployUrl}
          onChange={(e) => setDeployUrl(e.target.value)}
          placeholder="https://app.miempresa.com"
          className="field"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Stack / tecnologías</label>
        <div className="flex flex-wrap gap-2">
          {stack.map((item, i) => (
            <span key={`${item}-${i}`} className="tag border border-line bg-paper text-ink-soft">
              {item}
              <button onClick={() => setStack((prev) => prev.filter((_, idx) => idx !== i))} className="ml-1.5">
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <input
            value={stackInput}
            onChange={(e) => setStackInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addStackItem();
              }
            }}
            placeholder="Ej: Next.js"
            className="field flex-1"
          />
          <button onClick={addStackItem} type="button" className="btn-ghost">
            Añadir
          </button>
        </div>
      </div>

      {error && <p className="text-sm font-medium text-danger">{error}</p>}
      {saved && !error && <p className="text-sm font-medium text-moss">Guardado.</p>}

      <div className="border-t border-line pt-5">
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
