"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { cn } from "@/lib/ui";
import { STATUSES, STATUS_META, type IssueStatus } from "@/lib/scrum/constants";
import type { IssueCardData } from "@/lib/types";
import { IssueCardView } from "@/components/issue/IssueViews";
import { useToast } from "@/components/ui/Toaster";

const DONE_VISIBLE = 5;
const LONG_PRESS_MS = 320; // mantener pulsada la tarjeta para «levantarla», como un icono del teléfono
const MOVE_TOLERANCE = 9; // si el dedo se mueve más antes de levantarla, es un desplazamiento normal
const EDGE_PX = 44; // franja en el borde de la pantalla que pasa de página mientras arrastras
const FLIP_FIRST_MS = 420;
const FLIP_REPEAT_MS = 650;

type Drag = { id: string; x: number; y: number; dx: number; dy: number; w: number };

// Tablero para el teléfono, como las pantallas de inicio: cada columna es una «página» que se desliza de lado.
// Mantén pulsada una tarjeta y se levanta; sin soltarla, llévala al borde izquierdo o derecho y pasa a la
// página vecina; suéltala en la columna y la posición que quieras. Un toque abre el detalle. En «⇄ Mover» hay una
// alternativa sin arrastrar.
export default function MobileBoard({ projectId, issues, onOpen, readOnly = false }: { projectId: string; issues: IssueCardData[]; onOpen: (i: IssueCardData) => void; readOnly?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const scroller = useRef<HTMLDivElement>(null);
  const [override, setOverride] = useState<Record<string, IssueStatus>>({}); // movimientos recién hechos, hasta que llegue lo del servidor
  const [moving, setMoving] = useState<IssueCardData | null>(null); // hoja «Mover a…»
  const [busy, setBusy] = useState(false);
  const [showAllDone, setShowAllDone] = useState(false);
  const [page, setPage] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const pageRef = useRef(0);
  pageRef.current = page;

  useEffect(() => setOverride({}), [issues]);

  const items = useMemo(() => issues.map((i) => (override[i.id] ? { ...i, status: override[i.id] } : i)), [issues, override]);
  const byStatus = useMemo(() => {
    const out: Record<string, IssueCardData[]> = Object.fromEntries(STATUSES.map((s) => [s, []]));
    for (const i of items) out[i.status]?.push(i);
    out.DONE.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
    return out;
  }, [items]);
  const byStatusRef = useRef(byStatus);
  byStatusRef.current = byStatus;

  // ---- páginas ----
  const goTo = useCallback((index: number, smooth = true) => {
    const sc = scroller.current;
    const col = sc?.children[index] as HTMLElement | undefined;
    if (!sc || !col) return;
    sc.scrollTo({ left: Math.max(0, col.offsetLeft - (sc.clientWidth - col.offsetWidth) / 2), behavior: smooth ? "smooth" : "auto" });
    setPage(index);
  }, []);

  // La página actual sigue al desplazamiento (la columna más cercana al centro).
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const mid = sc.scrollLeft + sc.clientWidth / 2;
        let best = 0;
        let bestDist = Infinity;
        Array.from(sc.children).forEach((el, i) => {
          const c = el as HTMLElement;
          const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid);
          if (d < bestDist) { bestDist = d; best = i; }
        });
        setPage(best);
      });
    };
    sc.addEventListener("scroll", onScroll, { passive: true });
    return () => { sc.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);

  // Al abrir el tablero se muestra la primera columna con algo en curso (si no, Por hacer).
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const idx = Math.max(0, STATUSES.findIndex((s) => s === "IN_PROGRESS" && issues.some((i) => i.status === s)));
    if (idx > 0) requestAnimationFrame(() => goTo(idx, false));
  }, [issues, goTo]);

  // ---- mover (API) ----
  async function moveIssue(issue: IssueCardData, status: IssueStatus, prevId: string | null, nextId: string | null) {
    setBusy(true);
    const res = await api(`/api/projects/${projectId}/move`, "POST", { issueId: issue.id, status, prevId: status === "DONE" ? null : prevId, nextId: status === "DONE" ? null : nextId });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setOverride((o) => ({ ...o, [issue.id]: status }));
    if (issue.status !== status) toast.success(`${issue.key} → ${STATUS_META[status].label}`);
    router.refresh();
  }

  async function moveFromSheet(status: IssueStatus) {
    const issue = moving;
    if (!issue || busy) return;
    setMoving(null);
    if (issue.status === status) return;
    const first = byStatusRef.current[status].find((i) => i.id !== issue.id)?.id ?? null; // arriba de la columna
    await moveIssue(issue, status, null, first);
  }

  // ---- arrastrar (pulsación larga) ----
  const lift = useCallback((id: string, x: number, y: number, rect: DOMRect) => {
    suppressClick.current = true;
    if (typeof navigator !== "undefined") navigator.vibrate?.(14);
    const d = { id, x, y, dx: x - rect.left, dy: y - rect.top, w: rect.width };
    dragRef.current = d;
    setDrag(d);
  }, []);

  useEffect(() => {
    if (!drag) return;
    const id = drag.id;
    let edgeSince = 0; // desde cuándo está el dedo en la franja del borde
    let lastFlip = 0;

    const finish = async (cancel: boolean) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      setTimeout(() => { suppressClick.current = false; }, 60);
      if (!d || cancel) return;
      const issue = items.find((i) => i.id === id);
      if (!issue) return;
      // Columna bajo el dedo (si está entre dos, la de la página actual)
      const under = document.elementFromPoint(d.x, d.y)?.closest<HTMLElement>("[data-col]");
      const colEl = under ?? (scroller.current?.children[pageRef.current] as HTMLElement | undefined);
      const status = (colEl?.dataset.col as IssueStatus | undefined) ?? issue.status;
      // Posición dentro de la columna: entre las tarjetas según la altura del dedo
      const cards = Array.from(colEl?.querySelectorAll<HTMLElement>("[data-card]") ?? []).filter((c) => c.dataset.card !== id);
      let index = cards.length;
      for (let i = 0; i < cards.length; i++) {
        const r = cards[i].getBoundingClientRect();
        if (d.y < r.top + r.height / 2) { index = i; break; }
      }
      const prevId = index > 0 ? cards[index - 1].dataset.card ?? null : null;
      const nextId = index < cards.length ? cards[index].dataset.card ?? null : null;
      if (status === issue.status && prevId === null && nextId === null) return;
      await moveIssue(issue, status, prevId, nextId);
    };
    const onEnd = () => void finish(false);
    const onCancel = () => void finish(true);

    // Pasar de página al llegar al borde, y desplazar la pantalla hacia arriba/abajo cerca de sus extremos.
    const loop = setInterval(() => {
      const d = dragRef.current;
      if (!d) return;
      const now = Date.now();
      const dir = d.x < EDGE_PX ? -1 : d.x > window.innerWidth - EDGE_PX ? 1 : 0;
      if (dir === 0) edgeSince = 0;
      else {
        if (!edgeSince) edgeSince = now;
        const ready = lastFlip ? now - lastFlip >= FLIP_REPEAT_MS : now - edgeSince >= FLIP_FIRST_MS;
        const target = pageRef.current + dir;
        if (ready && target >= 0 && target < STATUSES.length) {
          lastFlip = now;
          goTo(target);
          navigator.vibrate?.(8);
        }
      }
      if (dir === 0) lastFlip = 0;
      if (d.y < 90) window.scrollBy(0, -14);
      else if (d.y > window.innerHeight - 90) window.scrollBy(0, 14);
    }, 90);

    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onCancel);
    return () => {
      clearInterval(loop);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id]);

  // El seguimiento del dedo se registra desde el principio (no al levantar): así el navegador ya sabe que puede
  // cancelarse el desplazamiento y no se lleva el gesto en el primer movimiento.
  useEffect(() => {
    const onMove = (e: TouchEvent) => {
      if (!dragRef.current) return;
      e.preventDefault(); // con la tarjeta levantada, el dedo no desplaza la pantalla
      const t = e.touches[0];
      if (!t) return;
      const next = { ...dragRef.current, x: t.clientX, y: t.clientY };
      dragRef.current = next;
      setDrag(next);
    };
    window.addEventListener("touchmove", onMove, { passive: false });
    return () => window.removeEventListener("touchmove", onMove);
  }, []);

  const ghost = drag ? items.find((i) => i.id === drag.id) : null;
  const total = items.length;

  return (
    <div>
      {/* Indicador de páginas: cada columna con su número; tocar uno lleva a esa columna */}
      <div className="-mx-4 mb-3 overflow-x-auto px-4" role="tablist" aria-label="Columnas del tablero">
        <div className="flex min-w-max gap-2">
          {STATUSES.map((s, i) => (
            <button
              key={s}
              role="tab"
              aria-selected={page === i}
              onClick={() => goTo(i)}
              className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold", page === i ? "border-transparent text-white" : "border-line-strong bg-card text-ink-soft")}
              style={page === i ? { background: STATUS_META[s].color } : undefined}
            >
              {page !== i && <span className="h-2 w-2 rounded-full" style={{ background: STATUS_META[s].color }} />}
              {STATUS_META[s].label}
              <span className={cn("font-mono", page === i ? "text-white/80" : "text-ink-faint")}>{byStatus[s].length}</span>
            </button>
          ))}
        </div>
      </div>

      <div ref={scroller} className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4" style={{ scrollbarWidth: "none", overscrollBehaviorX: "contain" }}>
        {STATUSES.map((s) => {
          const list = byStatus[s];
          const collapsed = s === "DONE" && !showAllDone && list.length > DONE_VISIBLE;
          const shown = collapsed ? list.slice(0, DONE_VISIBLE) : list;
          const hot = drag && STATUSES[page] === s;
          return (
            <section key={s} data-col={s} className={cn("min-h-[55vh] w-[86%] shrink-0 snap-center rounded-md border bg-card-2/40 transition-colors", hot ? "border-moss bg-card-2" : "border-line-strong")}>
              <header className="flex items-center gap-2 border-b border-line-strong px-3 py-2">
                <span className="h-2.5 w-2.5" style={{ background: STATUS_META[s].color }} />
                <span className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">{STATUS_META[s].label}</span>
                <span className="font-mono text-xs text-ink-faint">{list.length}</span>
              </header>
              <ul className="flex flex-col gap-2 p-2">
                {shown.map((i) => (
                  <li key={i.id} data-card={i.id} className={cn("select-none [-webkit-touch-callout:none]", drag?.id === i.id && "opacity-30")}>
                    <PressCard
                      issue={i}
                      enabled={!readOnly && !busy}
                      onLift={lift}
                      onOpen={() => { if (!suppressClick.current) onOpen(i); }}
                      onMove={readOnly ? undefined : () => setMoving(i)}
                    />
                  </li>
                ))}
                {list.length === 0 && <li className="py-10 text-center text-xs text-ink-faint">{drag ? "Suelta aquí" : "Sin tickets"}</li>}
                {s === "DONE" && list.length > DONE_VISIBLE && (
                  <li>
                    <button type="button" onClick={() => setShowAllDone((v) => !v)} className="w-full rounded-md border border-dashed border-line-strong px-3 py-2 text-xs font-semibold text-ink-soft" aria-expanded={showAllDone}>
                      {showAllDone ? "Mostrar solo las últimas" : `Ver las ${list.length - DONE_VISIBLE} anteriores`}
                    </button>
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>

      {total > 0 && !readOnly && <p className="text-center text-[11px] text-ink-faint">Mantén pulsada una tarjeta para moverla: llévala al borde para cambiar de columna.</p>}

      {/* La tarjeta levantada sigue al dedo */}
      {drag && ghost && (
        <div className="pointer-events-none fixed z-[60]" style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.w }} aria-hidden>
          <IssueCardView issue={ghost} overlay />
        </div>
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
                  onClick={() => moveFromSheet(s)}
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

// Tarjeta que se «levanta» al mantenerla pulsada. Si el dedo se mueve antes de tiempo, es un desplazamiento normal.
function PressCard({ issue, enabled, onLift, onOpen, onMove }: { issue: IssueCardData; enabled: boolean; onLift: (id: string, x: number, y: number, rect: DOMRect) => void; onOpen: () => void; onMove?: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const el = useRef<HTMLDivElement>(null);
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => clear, []);

  return (
    <div
      ref={el}
      onTouchStart={(e) => {
        if (!enabled || e.touches.length !== 1) return;
        const t = e.touches[0];
        start.current = { x: t.clientX, y: t.clientY };
        clear();
        timer.current = setTimeout(() => {
          timer.current = null;
          const s = start.current;
          if (s && el.current) onLift(issue.id, s.x, s.y, el.current.getBoundingClientRect());
        }, LONG_PRESS_MS);
      }}
      onTouchMove={(e) => {
        const s = start.current;
        const t = e.touches[0];
        if (s && t && Math.hypot(t.clientX - s.x, t.clientY - s.y) > MOVE_TOLERANCE) clear();
      }}
      onTouchEnd={clear}
      onTouchCancel={clear}
      onContextMenu={(e) => e.preventDefault()}
    >
      <IssueCardView issue={issue} onOpen={onOpen} onMove={onMove} />
    </div>
  );
}
