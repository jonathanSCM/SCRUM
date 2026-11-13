"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
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
import { api } from "@/lib/client";
import { cn, pct } from "@/lib/ui";
import { daysRemaining } from "@/lib/scrum/sprintLifecycle";
import { STATUSES, STATUS_META, type IssueStatus } from "@/lib/scrum/constants";
import type { IssueCardData, ProjectOptions, SprintData } from "@/lib/types";
import { IssueCardView } from "@/components/issue/IssueViews";
import CreateIssueModal from "@/components/issue/CreateIssueModal";
import { useOpenIssue } from "@/components/issue/useOpenIssue";
import { CompleteSprintModal } from "@/components/sprint/SprintModals";
import { ProgressBar } from "@/components/ui/Motion";
import { PlusIcon } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toaster";

type GroupBy = "none" | "assignee" | "epic";
const SEP = "::";

function laneOf(issue: IssueCardData, groupBy: GroupBy): { key: string; label: string } {
  if (groupBy === "assignee") return issue.assignee ? { key: issue.assignee.id, label: issue.assignee.name } : { key: "none", label: "Sin asignar" };
  if (groupBy === "epic") return issue.epic ? { key: issue.epic.id, label: issue.epic.title } : { key: "none", label: "Sin épica" };
  return { key: "all", label: "" };
}

export default function BoardView({
  projectId,
  sprint,
  issues,
  options,
  currentUserId,
  plannedSprints,
}: {
  projectId: string;
  sprint: SprintData;
  issues: IssueCardData[];
  options: ProjectOptions;
  currentUserId: string;
  plannedSprints: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const toast = useToast();
  const openIssue = useOpenIssue();

  const [byId, setById] = useState<Record<string, IssueCardData>>({});
  const [lists, setLists] = useState<Record<string, string[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  useLiveRefresh(`/api/projects/${projectId}/live`, { paused: !!activeId });
  const [mine, setMine] = useState(false);
  const [assignee, setAssignee] = useState("");
  const [epic, setEpic] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [creating, setCreating] = useState(false);
  const [completing, setCompleting] = useState(false);

  const visible = useMemo(
    () =>
      issues.filter((i) => {
        if (mine && i.assignee?.id !== currentUserId) return false;
        if (assignee === "none" ? i.assignee : assignee && i.assignee?.id !== assignee) return false;
        if (epic === "none" ? i.epic : epic && i.epic?.id !== epic) return false;
        return true;
      }),
    [issues, mine, assignee, epic, currentUserId]
  );

  const lanes = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of visible) {
      const l = laneOf(i, groupBy);
      map.set(l.key, l.label);
    }
    if (groupBy === "none") map.set("all", "");
    return Array.from(map, ([key, label]) => ({ key, label })).sort((a, b) => (a.key === "none" ? 1 : b.key === "none" ? -1 : a.label.localeCompare(b.label)));
  }, [visible, groupBy]);

  useEffect(() => {
    setById(Object.fromEntries(issues.map((i) => [i.id, i])));
    const next: Record<string, string[]> = {};
    for (const lane of lanes) for (const s of STATUSES) next[`${lane.key}${SEP}${s}`] = [];
    for (const i of visible) next[`${laneOf(i, groupBy).key}${SEP}${i.status}`]?.push(i.id);
    setLists(next);
  }, [issues, visible, lanes, groupBy]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function findContainer(id: string): string | null {
    if (id in lists) return id;
    for (const [c, ids] of Object.entries(lists)) if (ids.includes(id)) return c;
    return null;
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
      target.splice(overIndex >= 0 ? overIndex : target.length, 0, String(active.id));
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
    if (findContainer(String(over.id)) === container) {
      const oldIndex = list.indexOf(id);
      const newIndex = list.indexOf(String(over.id));
      if (oldIndex !== newIndex && newIndex >= 0) {
        list = list.slice();
        list.splice(oldIndex, 1);
        list.splice(newIndex, 0, id);
        setLists((prev) => ({ ...prev, [container]: list }));
      }
    }

    const status = container.split(SEP)[1] as IssueStatus;
    const index = list.indexOf(id);
    const prevId = index > 0 ? list[index - 1] : null;
    const nextId = index < list.length - 1 ? list[index + 1] : null;
    const res = await api(`/api/projects/${projectId}/move`, "POST", { issueId: id, status, prevId, nextId });
    if (!res.ok) toast.error(res.error);
    router.refresh();
  }

  const totals = useMemo(() => {
    let done = 0, total = 0, donePts = 0, totalPts = 0;
    for (const i of issues) {
      total++;
      totalPts += i.storyPoints ?? 0;
      if (i.status === "DONE") { done++; donePts += i.storyPoints ?? 0; }
    }
    return { done, total, donePts, totalPts, percent: totalPts > 0 ? pct(donePts, totalPts) : pct(done, total) };
  }, [issues]);

  const left = daysRemaining(sprint.endDate ? new Date(sprint.endDate) : null);
  const activeIssue = activeId ? byId[activeId] : null;
  const openCount = totals.total - totals.done;

  return (
    <div>
      {/* Encabezado del sprint */}
      <div className="mb-5 border border-line bg-card p-4 rounded-lg">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="font-display text-xl font-extrabold text-ink">{sprint.name}</h2>
          {left !== null && (
            <span className={cn("lozenge", left < 0 ? "text-danger" : left <= 2 ? "text-warn" : "text-moss-ink")}>
              {left < 0 ? `Vencido hace ${-left} d` : left === 0 ? "Termina hoy" : `${left} d restantes`}
            </span>
          )}
          <span className="font-mono text-xs text-ink-faint">
            {totals.done}/{totals.total} tickets{totals.totalPts > 0 ? ` · ${totals.donePts}/${totals.totalPts} pts` : ""}
          </span>
          <div className="ml-auto flex gap-2">
            <button className="btn-ghost btn-sm" onClick={() => setCreating(true)}>
              <PlusIcon size={14} /> Crear ticket
            </button>
            <button className="btn-mint btn-sm" onClick={() => setCompleting(true)}>Completar sprint</button>
          </div>
        </div>
        {sprint.goal && <p className="mt-2 text-sm text-ink-soft"><b className="text-ink">Objetivo:</b> {sprint.goal}</p>}
        <div className="mt-3">
          <ProgressBar value={totals.percent} />
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setMine((v) => !v)}
          className={cn("border px-2.5 py-1 text-xs font-bold transition-colors rounded-md", mine ? "border-rust bg-rust text-white" : "border-line-strong text-ink-soft hover:text-ink")}
          aria-pressed={mine}
        >
          Solo mis tickets
        </button>
        <select className="field-sm" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Encargado">
          <option value="">Todos los encargados</option>
          <option value="none">Sin asignar</option>
          {options.members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        {options.epics.length > 0 && (
          <select className="field-sm" value={epic} onChange={(e) => setEpic(e.target.value)} aria-label="Épica">
            <option value="">Todas las épicas</option>
            <option value="none">Sin épica</option>
            {options.epics.map((ep) => (
              <option key={ep.id} value={ep.id}>{ep.key} {ep.title}</option>
            ))}
          </select>
        )}
        <select className="field-sm ml-auto" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} aria-label="Agrupar por">
          <option value="none">Sin agrupar</option>
          <option value="assignee">Agrupar por encargado</option>
          <option value="epic">Agrupar por épica</option>
        </select>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setActiveId(null); router.refresh(); }}>
        <div className="space-y-6 overflow-x-auto pb-2">
          {lanes.map((lane) => (
            <div key={lane.key} className="min-w-[1120px]">
              {groupBy !== "none" && (
                <h3 className="mb-2 flex items-center gap-2 font-display text-sm font-extrabold text-ink">
                  {lane.label}
                  <span className="font-mono text-xs font-medium text-ink-faint">
                    {STATUSES.reduce((n, s) => n + (lists[`${lane.key}${SEP}${s}`]?.length ?? 0), 0)}
                  </span>
                </h3>
              )}
              <div className="grid grid-cols-5 gap-3">
                {STATUSES.map((status) => (
                  <Column key={status} id={`${lane.key}${SEP}${status}`} status={status} ids={lists[`${lane.key}${SEP}${status}`] ?? []} byId={byId} onOpen={(i) => openIssue(i.key)} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 160 }}>{activeIssue ? <IssueCardView issue={activeIssue} overlay /> : null}</DragOverlay>
      </DndContext>

      {issues.length === 0 && <p className="mt-4 text-center text-sm text-ink-faint">El sprint no tiene tickets. Sumalos desde el backlog.</p>}

      <CreateIssueModal open={creating} onClose={() => setCreating(false)} projectId={projectId} options={options} defaultSprintId={sprint.id} currentUserId={currentUserId} />
      {completing && (
        <CompleteSprintModal
          open
          onClose={() => setCompleting(false)}
          sprint={sprint}
          doneCount={totals.done}
          openCount={openCount}
          donePoints={totals.donePts}
          plannedSprints={plannedSprints}
        />
      )}
    </div>
  );
}

function Column({ id, status, ids, byId, onOpen }: { id: string; status: IssueStatus; ids: string[]; byId: Record<string, IssueCardData>; onOpen: (i: IssueCardData) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const meta = STATUS_META[status];
  const points = ids.reduce((n, i) => n + (byId[i]?.storyPoints ?? 0), 0);
  return (
    <div ref={setNodeRef} className={cn("flex min-h-[200px] flex-col border bg-card-2/40 transition-colors rounded-md", isOver ? "border-moss bg-card-2" : "border-line-strong")}>
      <div className="flex items-center gap-2 border-b border-line-strong px-3 py-2">
        <span className="h-2.5 w-2.5" style={{ background: meta.color }} />
        <span className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">{meta.label}</span>
        <span className="font-mono text-xs text-ink-faint">{ids.length}</span>
        {points > 0 && <span className="ml-auto font-mono text-[11px] text-ink-faint">{points} pts</span>}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2">
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id) => byId[id] && <SortableCard key={id} issue={byId[id]} onOpen={() => onOpen(byId[id])} />)}
        </SortableContext>
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
