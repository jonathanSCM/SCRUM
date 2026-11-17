"use client";

import { cn } from "@/lib/ui";
import { describeRule, draftToRule, isoWeekday, type RepeatDraft, type RepeatKind } from "@/lib/scrum/recurrence";

const KINDS: Array<[RepeatKind, string]> = [
  ["none", "No se repite"],
  ["daily", "Todos los días"],
  ["weekdays", "De lunes a viernes"],
  ["weekly", "Cada semana"],
  ["monthly", "Cada mes"],
];
const DAYS = [
  [1, "L", "lunes"],
  [2, "M", "martes"],
  [3, "X", "miércoles"],
  [4, "J", "jueves"],
  [5, "V", "viernes"],
  [6, "S", "sábado"],
  [7, "D", "domingo"],
] as const;

// «Repetir»: cada cuánto, qué días y cuándo termina. `startDate` es la fecha de la primera reunión (YYYY-MM-DD).
export default function RepeatControls({ draft, onChange, startDate, disabled = false }: { draft: RepeatDraft; onChange: (d: RepeatDraft) => void; startDate: string; disabled?: boolean }) {
  const set = (patch: Partial<RepeatDraft>) => onChange({ ...draft, ...patch });
  const result = draftToRule(draft, startDate);
  const summary = result && "rule" in result ? describeRule(startDate, result.rule) : null;
  const error = result && "error" in result ? result.error : null;
  const first = startDate ? isoWeekday(startDate) : 1;
  const days = draft.weekdays.length ? draft.weekdays : [first];
  const unit = draft.kind === "daily" ? "días" : draft.kind === "monthly" ? "meses" : "semanas";

  return (
    <fieldset disabled={disabled} className={cn("space-y-2 rounded-lg border border-line p-3", disabled && "opacity-60")}>
      <legend className="px-1 text-xs font-semibold text-ink-soft">Repetir</legend>
      <div className="flex flex-wrap items-center gap-2">
        <select className="field-sm" value={draft.kind} onChange={(e) => set({ kind: e.target.value as RepeatKind, ...(e.target.value === "weekly" && draft.weekdays.length === 0 ? { weekdays: [first] } : {}) })} aria-label="Repetir">
          {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {(draft.kind === "daily" || draft.kind === "weekly" || draft.kind === "monthly") && (
          <label className="flex items-center gap-1.5 text-xs text-ink-soft">
            cada
            <input type="number" min={1} max={draft.kind === "daily" ? 30 : 12} className="field-sm w-16" value={draft.interval} onChange={(e) => set({ interval: Math.max(1, Math.min(draft.kind === "daily" ? 30 : 12, Number(e.target.value) || 1)) })} aria-label={`Cada cuántos ${unit}`} />
            {unit}
          </label>
        )}
      </div>

      {draft.kind === "weekly" && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Días de la semana">
          {DAYS.map(([n, short, name]) => {
            const on = days.includes(n);
            return (
              <button
                key={n}
                type="button"
                aria-pressed={on}
                aria-label={name}
                title={name}
                onClick={() => {
                  const next = on ? days.filter((d) => d !== n) : [...days, n].sort((a, b) => a - b);
                  set({ weekdays: next.length ? next : [n] }); // siempre queda al menos un día
                }}
                className={cn("h-8 w-8 rounded-full border text-xs font-bold", on ? "border-rust bg-rust text-white" : "border-line-strong text-ink-soft hover:text-ink")}
              >
                {short}
              </button>
            );
          })}
        </div>
      )}
      {draft.kind === "monthly" && startDate && <p className="text-xs text-ink-faint">El día {Number(startDate.split("-")[2])} de cada mes (el último día si el mes es más corto).</p>}

      {draft.kind !== "none" && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
          <span>Termina</span>
          <select className="field-sm" value={draft.end} onChange={(e) => set({ end: e.target.value as RepeatDraft["end"] })} aria-label="Cuándo termina">
            <option value="never">Nunca</option>
            <option value="until">El día</option>
            <option value="count">Después de</option>
          </select>
          {draft.end === "until" && <input type="date" className="field-sm" value={draft.until} min={startDate} onChange={(e) => set({ until: e.target.value })} aria-label="Fecha de término" />}
          {draft.end === "count" && (
            <>
              <input type="number" min={2} max={365} className="field-sm w-20" value={draft.count} onChange={(e) => set({ count: Math.max(2, Math.min(365, Number(e.target.value) || 2)) })} aria-label="Número de reuniones" />
              <span>reuniones</span>
            </>
          )}
        </div>
      )}
      {error ? <p className="text-xs font-semibold text-danger">{error}</p> : summary ? <p className="text-xs text-ink-soft">⟳ {summary}.</p> : null}
    </fieldset>
  );
}
