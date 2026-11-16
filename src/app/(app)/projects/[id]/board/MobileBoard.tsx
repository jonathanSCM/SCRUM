"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { cn } from "@/lib/ui";
import { STATUSES, STATUS_META, type IssueStatus } from "@/lib/scrum/constants";
import type { IssueCardData } from "@/lib/types";
import { IssueCardView } from "@/components/issue/IssueViews";
import { useToast } from "@/components/ui/Toaster";

const DONE_VISIBLE = 5;

// Tablero para el teléfono: una columna a la vez (con pestañas por estado) y un botón «Mover a…» en cada tarjeta.
// Arrastrar con el dedo choca con el desplazamiento de la pantalla, así que aquí no se arrastra: se toca la tarjeta
// y se elige a qué columna va.
export default function MobileBoard({ projectId, issues, onOpen, readOnly = false }: { projectId: string; issues: IssueCardData[]; onOpen: (i: IssueCardData) => void; readOnly?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [override, setOverride] = useState<Record<string, IssueStatus>>({}); // movimientos recién hechos, hasta que llegue lo del servidor
  const [moving, setMoving] = useState<IssueCardData | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAllDone, setShowAllDone] = useState(false);

  useEffect(() => setOverride({}), [issues]);

  const items = useMemo(() => issues.map((i) => (override[i.id] ? { ...i, status: override[i.id] } : i)), [issues, override]);
  const byStatus = useMemo(() => {
    const out: Record<string, IssueCardData[]> = Object.fromEntries(STATUSES.map((s) => [s, []]));
    for (const i of items) out[i.status]?.push(i);
    out.DONE.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
    return out;
  }, [items]);

  const [tab, setTab] = useState<IssueStatus>(() => (STATUSES.find((s) => s !== "DONE" && issues.some((i) => i.status === s && s !== "TODO")) ?? "TODO"));

  async function moveTo(status: IssueStatus) {
    const issue = moving;
    if (!issue || busy) return;
    if (issue.status === status) return setMoving(null);
    setBusy(true);
    // Arriba de la columna de destino (en Hecho el orden es por fecha, no importa).
    const first = status === "DONE" ? null : byStatus[status].find((i) => i.id !== issue.id)?.id ?? null;
    const res = await api(`/api/projects/${projectId}/move`, "POST", { issueId: issue.id, status, prevId: null, nextId: first });
    setBusy(false);
    setMoving(null);
    if (!res.ok) return toast.error(res.error);
    setOverride((o) => ({ ...o, [issue.id]: status }));
    toast.success(`${issue.key} → ${STATUS_META[status].label}`);
    router.refresh();
  }

  const list = byStatus[tab] ?? [];
  const collapsed = tab === "DONE" && !showAllDone && list.length > DONE_VISIBLE;
  const shown = collapsed ? list.slice(0, DONE_VISIBLE) : list;

  return (
    <div>
      <div className="-mx-4 mb-3 overflow-x-auto px-4" role="tablist" aria-label="Columnas del tablero">
        <div className="flex min-w-max gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={tab === s}
              onClick={() => setTab(s)}
              className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold", tab === s ? "border-transparent text-white" : "border-line-strong bg-card text-ink-soft")}
              style={tab === s ? { background: STATUS_META[s].color } : undefined}
            >
              {tab !== s && <span className="h-2 w-2 rounded-full" style={{ background: STATUS_META[s].color }} />}
              {STATUS_META[s].label}
              <span className={cn("font-mono", tab === s ? "text-white/80" : "text-ink-faint")}>{byStatus[s].length}</span>
            </button>
          ))}
        </div>
      </div>

      <ul className="space-y-2.5">
        {shown.map((i) => (
          <li key={i.id}>
            <IssueCardView issue={i} onOpen={() => onOpen(i)} onMove={readOnly ? undefined : () => setMoving(i)} />
          </li>
        ))}
      </ul>
      {list.length === 0 && <p className="rounded-lg border border-dashed border-line-strong p-6 text-center text-sm text-ink-faint">No hay tickets en «{STATUS_META[tab].label}».</p>}
      {tab === "DONE" && list.length > DONE_VISIBLE && (
        <button type="button" onClick={() => setShowAllDone((v) => !v)} className="mt-2.5 w-full rounded-md border border-dashed border-line-strong px-3 py-2 text-xs font-semibold text-ink-soft" aria-expanded={showAllDone}>
          {showAllDone ? "Mostrar solo las últimas" : `Ver las ${list.length - DONE_VISIBLE} anteriores`}
        </button>
      )}

      {moving && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/45" onClick={() => !busy && setMoving(null)} role="dialog" aria-modal="true" aria-label={`Mover ${moving.key}`}>
          <div className="w-full rounded-t-2xl border-t border-line-strong bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-hard" onClick={(e) => e.stopPropagation()}>
            <p className="mb-1 font-mono text-xs text-ink-faint">{moving.key}</p>
            <p className="mb-3 line-clamp-2 text-sm font-semibold text-ink">{moving.title}</p>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">Mover a</p>
            <div className="grid gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  disabled={busy}
                  onClick={() => moveTo(s)}
                  aria-current={moving.status === s}
                  className={cn("flex items-center gap-3 rounded-lg border px-3 py-3 text-left text-sm font-semibold", moving.status === s ? "border-line bg-card-2 text-ink-faint" : "border-line-strong text-ink active:bg-card-2")}
                >
                  <span className="h-3 w-3 rounded-full" style={{ background: STATUS_META[s].color }} />
                  {STATUS_META[s].label}
                  {moving.status === s && <span className="ml-auto text-xs font-normal">está aquí</span>}
                </button>
              ))}
            </div>
            <button className="btn-ghost mt-3 w-full" onClick={() => setMoving(null)} disabled={busy}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
