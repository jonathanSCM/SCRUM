"use client";

import { useState } from "react";
import { PRIORITY_LABEL } from "@/lib/taskLabels";

export default function BulkActionsBar({
  count,
  sprints,
  onApplySprint,
  onApplyPriority,
  onClear,
  busy,
}: {
  count: number;
  sprints: { id: string; name: string }[];
  onApplySprint: (sprintId: string | null) => void;
  onApplyPriority: (priority: string) => void;
  onClear: () => void;
  busy: boolean;
}) {
  const [sprintChoice, setSprintChoice] = useState("");
  const [priorityChoice, setPriorityChoice] = useState("");

  return (
    <div className="sticky top-[73px] z-10 flex flex-wrap items-center gap-3 border-2 border-line bg-card p-3 shadow-[6px_6px_0_var(--moss)]">
      <span className="text-xs font-semibold text-ink">{count} seleccionada{count === 1 ? "" : "s"}</span>

      <div className="flex items-center gap-1.5">
        <select
          value={sprintChoice}
          onChange={(e) => setSprintChoice(e.target.value)}
          disabled={busy}
          className="field !w-auto py-1 text-xs"
        >
          <option value="">Mover a sprint...</option>
          <option value="__none__">Sin sprint</option>
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!sprintChoice || busy}
          onClick={() => {
            onApplySprint(sprintChoice === "__none__" ? null : sprintChoice);
            setSprintChoice("");
          }}
          className="btn-ghost !py-1 !text-xs"
        >
          Aplicar
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <select
          value={priorityChoice}
          onChange={(e) => setPriorityChoice(e.target.value)}
          disabled={busy}
          className="field !w-auto py-1 text-xs"
        >
          <option value="">Cambiar prioridad...</option>
          {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!priorityChoice || busy}
          onClick={() => {
            onApplyPriority(priorityChoice);
            setPriorityChoice("");
          }}
          className="btn-ghost !py-1 !text-xs"
        >
          Aplicar
        </button>
      </div>

      <button type="button" onClick={onClear} className="ml-auto text-xs text-ink-faint hover:text-ink">
        Cancelar selección
      </button>
    </div>
  );
}
