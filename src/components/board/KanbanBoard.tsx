"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/ui";
import { STATUSES, STATUS_META, type IssueStatus } from "@/lib/scrum/constants";
import type { IssueCardData } from "@/lib/types";
import { IssueCardView } from "@/components/issue/IssueViews";
import { useToast } from "@/components/ui/Toaster";
import MobileBoard from "./MobileBoard";

export type GroupBy = "none" | "assignee" | "epic" | "project";
const SEP = "::";

function laneOf(issue: IssueCardData, groupBy: GroupBy): { key: string; label: string } {
  if (groupBy === "assignee") return issue.assignee ? { key: issue.assignee.id, label: issue.assignee.name } : { key: "none", label: "Sin asignar" };
  if (groupBy === "epic") return issue.epic ? { key: issue.epic.id, label: issue.epic.title } : { key: "none", label: "Sin épica" };
  if (groupBy === "project") return { key: issue.projectId, label: issue.projectName ?? "Proyecto" };
  return { key: "all", label: "" };
}

export type MoveFn = (issue: IssueCardData, status: IssueStatus, prevId: string | null, nextId: string | null) => Promise<string | null>;

// El tablero Kanban (Por hacer · En progreso · Bloqueadas · En revisión · Hecho) que comparten el tablero de un proyecto
// y Mi trabajo: en computador y tableta se arrastra; en el teléfono son páginas que se deslizan (ver MobileBoard).
// `onMove` guarda el movimiento y devuelve el texto del error (o null si salió bien).
export default function KanbanBoard({
  issues,
  groupBy = "none",
  onOpen,
  onMove,
  onDragging,
  readOnly = false,
}: {
  issues: IssueCardData[]; // ya filtradas
  groupBy?: GroupBy;
  onOpen: (issue: IssueCardData) => void;
  onMove: MoveFn;
  onDragging?: (dragging: boolean) => void;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [byId, setById] = useState<Record<string, IssueCardData>>({});
  const [lists, setLists] = useState<Record<string, string[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => onDragging?.(!!activeId), [activeId, onDragging]);

  const lanes = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues) {
      const l = laneOf(i, groupBy);
      map.set(l.key, l.label);
    }
    if (groupBy === "none") map.set("all", "");
    return Array.from(map, ([key, label]) => ({ key, label })).sort((a, b) => (a.key === "none" ? 1 : b.key === "none" ? -1 : a.label.localeCompare(b.label)));
  }, [issues, groupBy]);

  useEffect(() => {
    setById(Object.fromEntries(issues.map((i) => [i.id, i])));
    const next: Record<string, string[]> = {};
    for (const lane of lanes) for (const s of STATUSES) next[`${lane.key}${SEP}${s}`] = [];
    for (const i of issues) next[`${laneOf(i, groupBy).key}${SEP}${i.status}`]?.push(i.id);
    // En "Hecho" lo terminado más reciente va arriba (el resto queda recogido: ver DONE_VISIBLE).
    const doneAt = new Map(issues.map((i) => [i.id, i.completedAt ?? ""]));
    for (const key of Object.keys(next)) if (key.endsWith(`${SEP}DONE`)) next[key].sort((a, b) => (doneAt.get(b) ?? "").localeCompare(doneAt.get(a) ?? ""));
    setLists(next);
  }, [issues, lanes, groupBy]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Tableta: mantener pulsada la tarjeta un instante para arrastrarla; un deslizamiento normal sigue desplazando la pantalla.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function findContainer(id: string): string | null {
    if (id in lists) return id;
    for (const [c, ids] of Object.entries(lists)) if (ids.includes(id)) return c;
    return null;
  }

  // ¿Ya estaba la tarjeta en esta columna al empezar a arrastrar? (para no mandar un "movimiento" que no lo es)
  function issueIsIn(id: string, container: string) {
    const original = byId[id];
    return !!original && container.endsWith(`${SEP}${original.status}`);
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const from = findContainer(String(active.id));
    const to = findContainer(String(over.id));
    if (!from || !to || from === to) return;
    setLists((prev) => {
      const target = [...prev[to]];
      const overIndex = target.indexOf(String(over.id));
      // Soltar en el hueco de "Hecho" lo deja arriba (es lo más reciente); si no, se vería recogido al final.
      target.splice(overIndex >= 0 ? overIndex : to.endsWith(`${SEP}DONE`) ? 0 : target.length, 0, String(active.id));
      return { ...prev, [from]: prev[from].filter((id) => id !== active.id), [to]: target };
    });
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over) return router.refresh();
    const id = String(active.id);
    const container = findContainer(id);
    if (!container) return;

    let list = lists[container];
    const status = container.split(SEP)[1] as IssueStatus;
    // En "Hecho" el orden es por fecha de término: reordenar ahí no significa nada.
    if (status === "DONE" && findContainer(String(over.id)) === container) {
      if (issueIsIn(id, container)) return router.refresh(); // ya estaba en Hecho: solo se reordenó, no hay nada que guardar
    }
    if (findContainer(String(over.id)) === container && status !== "DONE") {
      const oldIndex = list.indexOf(id);
      const newIndex = list.indexOf(String(over.id));
      if (oldIndex !== newIndex && newIndex >= 0) {
        list = list.slice();
        list.splice(oldIndex, 1);
        list.splice(newIndex, 0, id);
        setLists((prev) => ({ ...prev, [container]: list }));
      }
    }

    const index = list.indexOf(id);
    const prevId = status !== "DONE" && index > 0 ? list[index - 1] : null;
    const nextId = status !== "DONE" && index < list.length - 1 ? list[index + 1] : null;
    const issue = byId[id];
    if (issue) {
      const error = await onMove(issue, status, prevId, nextId);
      if (error) toast.error(error);
    }
    router.refresh();
  }

  const activeIssue = activeId ? byId[activeId] : null;

  return (
    <>
      {/* Teléfono: columnas como páginas que se deslizan; mantener pulsada una tarjeta la levanta. */}
      <div className="md:hidden">
        <MobileBoard issues={issues} onOpen={onOpen} onMove={onMove} readOnly={readOnly} />
      </div>

      <div className="hidden md:block">
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setActiveId(null); router.refresh(); }}>
          <div className="space-y-6 overflow-x-auto pb-2">
            {lanes.map((lane) => (
              <div key={lane.key} className="min-w-[1120px]">
                {groupBy !== "none" && (
                  <h3 className="mb-2 flex items-center gap-2 font-display text-sm font-extrabold text-ink">
                    {lane.label}
                    <span className="font-mono text-xs font-medium text-ink-faint">{STATUSES.reduce((n, s) => n + (lists[`${lane.key}${SEP}${s}`]?.length ?? 0), 0)}</span>
                  </h3>
                )}
                <div className="grid grid-cols-5 gap-3">
                  {STATUSES.map((status) => (
                    <Column key={status} id={`${lane.key}${SEP}${status}`} status={status} ids={lists[`${lane.key}${SEP}${status}`] ?? []} byId={byId} onOpen={onOpen} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <DragOverlay dropAnimation={{ duration: 160 }}>{activeIssue ? <IssueCardView issue={activeIssue} overlay /> : null}</DragOverlay>
        </DndContext>
      </div>
    </>
  );
}

// En "Hecho" solo se ven las últimas terminadas; el resto queda recogido tras «Ver las N anteriores» para que la columna no crezca sin fin.
const DONE_VISIBLE = 5;

function Column({ id, status, ids, byId, onOpen }: { id: string; status: IssueStatus; ids: string[]; byId: Record<string, IssueCardData>; onOpen: (i: IssueCardData) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const [showAll, setShowAll] = useState(false);
  const meta = STATUS_META[status];
  const points = ids.reduce((n, i) => n + (byId[i]?.storyPoints ?? 0), 0);
  const collapsed = status === "DONE" && !showAll && ids.length > DONE_VISIBLE;
  const shown = collapsed ? ids.slice(0, DONE_VISIBLE) : ids;
  return (
    <div ref={setNodeRef} className={cn("flex min-h-[200px] flex-col border bg-card-2/40 transition-colors rounded-md", isOver ? "border-moss bg-card-2" : "border-line-strong")}>
      <div className="flex items-center gap-2 border-b border-line-strong px-3 py-2">
        <span className="h-2.5 w-2.5" style={{ background: meta.color }} />
        <span className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">{meta.label}</span>
        <span className="font-mono text-xs text-ink-faint">{ids.length}</span>
        {points > 0 && <span className="ml-auto font-mono text-[11px] text-ink-faint">{points} pts</span>}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2">
        <SortableContext items={shown} strategy={verticalListSortingStrategy}>
          {shown.map((id) => byId[id] && <SortableCard key={id} issue={byId[id]} onOpen={() => onOpen(byId[id])} />)}
        </SortableContext>
        {status === "DONE" && ids.length > DONE_VISIBLE && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="rounded-md border border-dashed border-line-strong px-2 py-1.5 text-xs font-semibold text-ink-soft hover:text-ink" aria-expanded={showAll}>
            {showAll ? "Mostrar solo las últimas" : `Ver las ${ids.length - DONE_VISIBLE} anteriores`}
          </button>
        )}
        {ids.length === 0 && <p className="m-auto py-6 text-center text-xs text-ink-faint">Soltá un ticket acá</p>}
      </div>
    </div>
  );
}

function SortableCard({ issue, onOpen }: { issue: IssueCardData; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: issue.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, touchAction: "manipulation" }} {...attributes} {...listeners}>
      <IssueCardView issue={issue} onOpen={onOpen} dragging={isDragging} />
    </div>
  );
}
