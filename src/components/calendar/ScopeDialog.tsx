"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";

export type Scope = "one" | "following" | "all";

// «¿A cuáles reuniones?» para cambiar, cancelar o borrar una reunión que se repite.
export default function ScopeDialog({ title, confirmLabel, danger = false, busy = false, onConfirm, onClose }: { title: string; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: (s: Scope) => void; onClose: () => void }) {
  const [scope, setScope] = useState<Scope>("one");
  const options: Array<[Scope, string, string]> = [
    ["one", "Solo esta reunión", "Las demás de la serie no cambian."],
    ["following", "Esta y las siguientes", "Las anteriores se quedan como están."],
    ["all", "Toda la serie", "Todas las reuniones que vienen (las pasadas no cambian)."],
  ];
  return (
    <Modal open onClose={onClose} title={title} width="max-w-md">
      <div className="space-y-3">
        <div role="radiogroup" aria-label="A cuáles reuniones" className="space-y-2">
          {options.map(([v, label, hint]) => (
            <label key={v} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-sm ${scope === v ? "border-rust bg-chip-tint" : "border-line"}`}>
              <input type="radio" name="alcance" className="mt-1 accent-[var(--rust)]" checked={scope === v} onChange={() => setScope(v)} />
              <span><b className="block text-ink">{label}</b><span className="text-xs text-ink-faint">{hint}</span></span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost btn-sm" onClick={onClose} disabled={busy}>Volver</button>
          <button className={danger ? "btn-primary btn-sm !bg-danger" : "btn-primary btn-sm"} onClick={() => onConfirm(scope)} disabled={busy}>{busy ? "Guardando…" : confirmLabel}</button>
        </div>
      </div>
    </Modal>
  );
}
