"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
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
import { cn, formatDate } from "@/lib/ui";
import { daysRemaining } from "@/lib/scrum/sprintLifecycle";
import { ISSUE_TYPES, ISSUE_TYPE_META, PRIORITIES, PRIORITY_META, STATUSES, STATUS_META, type IssueStatus } from "@/lib/scrum/constants";
import type { IssueCardData, ProjectOptions, SprintData } from "@/lib/types";
import { IssueRowView } from "@/components/issue/IssueViews";
import CreateIssueModal from "@/components/issue/CreateIssueModal";
import { useOpenIssue } from "@/components/issue/useOpenIssue";
import { CompleteSprintModal, StartSprintModal } from "@/components/sprint/SprintModals";
import { SprintStateLozenge } from "@/components/ui/Lozenge";
import { ChevronIcon, PlusIcon } from "@/components/ui/Icons";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";

const BACKLOG = "backlog";

type Filters = { text: string; assignee: string; type: string; epic: string };
const NO_FILTERS: Filters = { text: "", assignee: "", type: "", epic: "" };

function groupIds(issues: IssueCardData[], sprints: SprintData[]): Record<string, string[]> {
  const out: Record<string, string[]> = { [BACKLOG]: [] };
  for (const s of sprints) out[s.id] = [];
  for (const i of issues) {
    const bucket = i.sprintId && out[i.sprintId] ? i.sprintId : BACKLOG;
    out[bucket].push(i.id);
  }
  return out;
}

export default function BacklogView({
  projectId,
  sprints,
  issues,
  options,
  currentUserId,
  isLead,
  completedSprints,
}: {
  projectId: string;
  sprints: SprintData[];
  issues: IssueCardData[];
  options: ProjectOptions;
  currentUserId: string;
  isLead: boolean;
  completedSprints: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const openIssue = useOpenIssue();

  const [byId, setById] = useState<Record<string, IssueCardData>>({});
  const [lists, setLists] = useState<Record<string, string[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [createFor, setCreateFor] = useState<{ open: boolean; sprintId: string | null }>({ open: false, sprintId: null });
  const [startFor, setStartFor] = useState<SprintData | null>(null);
  const [completeFor, setCompleteFor] = useState<SprintData | null>(null);
  const [editFor, setEditFor] = useState<SprintData | null>(null);
  const [creatingSprint, setCreatingSprint] = useState(false);

  // Se vuelve a sincronizar cuando el servidor manda datos nuevos (router.refresh).
  useEffect(() => {
    setById(Object.fromEntries(issues.map((i) => [i.id, i])));
    setLists(groupIds(issues, sprints));
    setSelected(new Set());
  }, [issues, sprints]);

  const filtersActive = Object.values(filters).some(Boolean);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Atajo "c": crear ticket.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "c" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      e.preventDefault();
      setCreateFor({ open: true, sprintId: null });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const matches = useCallback(
    (i: IssueCardData) => {
      const t = filters.text.trim().toLowerCase();
      if (t && !`${i.key} ${i.title}`.toLowerCase().includes(t)) return false;
      if (filters.assignee === "none" ? i.assignee : filters.assignee && i.assignee?.id !== filters.assignee) return false;
      if (filters.type && i.issueType !== filters.type) return false;
      if (filters.epic === "none" ? i.epic : filters.epic && i.epic?.id !== filters.epic) return false;
      return true;
    },
    [filters]
  );

  function findContainer(id: string): string | null {
    if (id in lists) return id;
    for (const [container, ids] of Object.entries(lists)) if (ids.includes(id)) return container;
    return null;
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const from = findContainer(String(active.id));
    const to = findContainer(String(over.id));
    if (!from || !to || from === to) return;

    setLists((prev) => {
      const source = prev[from].filter((id) => id !== active.id);
      const target = [...prev[to]];
      const overIndex = target.indexOf(String(over.id));
      const insertAt = overIndex >= 0 ? overIndex : target.length;
      target.splice(insertAt, 0, String(active.id));
      return { ...prev, [from]: source, [to]: target };
    });
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return router.refresh();

    const id = String(active.id);
    const container = findContainer(id);
    if (!container) return;

    // Reordenamiento dentro de la misma lista.
    let finalList = lists[container];
    const overContainer = findContainer(String(over.id));
    if (overContainer === container) {
      const oldIndex = finalList.indexOf(id);
      const newIndex = finalList.indexOf(String(over.id));
      if (oldIndex !== newIndex && newIndex >= 0) {
        finalList = arrayMove(finalList, oldIndex, newIndex);
        setLists((prev) => ({ ...prev, [container]: finalList }));
      }
    }

    const index = finalList.indexOf(id);
    const prevId = index > 0 ? finalList[index - 1] : null;
    const nextId = index < finalList.length - 1 ? finalList[index + 1] : null;
    const sprintId = container === BACKLOG ? null : container;

    const res = await api(`/api/projects/${projectId}/move`, "POST", { issueId: id, sprintId, prevId, nextId });
    if (!res.ok) toast.error(res.error);
    router.refresh();
  }

  async function changeStatus(issue: IssueCardData, status: IssueStatus) {
    setById((prev) => ({ ...prev, [issue.id]: { ...prev[issue.id], status } }));
    const res = await api(`/api/issues/${issue.id}`, "PATCH", { status });
    if (!res.ok) toast.error(res.error);
    router.refresh();
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createSprint() {
    setCreatingSprint(true);
    const res = await api(`/api/projects/${projectId}/sprints`, "POST", {});
    setCreatingSprint(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Sprint creado");
    router.refresh();
  }

  async function deleteSprint(s: SprintData) {
    const ok = await confirm(`¿Eliminar "${s.name}"? Sus tickets vuelven al backlog.`, { confirmLabel: "Eliminar", danger: true });
    if (!ok) return;
    const res = await api(`/api/sprints/${s.id}`, "DELETE");
    if (!res.ok) return toast.error(res.error);
    toast.success("Sprint eliminado");
    router.refresh();
  }

  async function quickCreate(title: string, sprintId: string | null) {
    const res = await api(`/api/projects/${projectId}/issues`, "POST", { title, issueType: "TASK", sprintId });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    router.refresh();
    return true;
  }

  async function bulk(patch: Record<string, unknown>) {
    const ids = Array.from(selected);
    const res = await api(`/api/projects/${projectId}/bulk`, "POST", { ids, patch });
    if (!res.ok) return toast.error(res.error);
    toast.success(`${ids.length} ${ids.length === 1 ? "ticket actualizado" : "tickets actualizados"}`);
    setSelected(new Set());
    router.refresh();
  }

  const activeSprint = sprints.find((s) => s.state === "ACTIVE") ?? null;
  const planned = sprints.filter((s) => s.state === "PLANNED");
  const ordered = [...(activeSprint ? [activeSprint] : []), ...planned];
  const activeIssue = activeId ? byId[activeId] : null;

  const summary = useMemo(() => {
    const out: Record<string, { count: number; points: number; byStatus: Record<IssueStatus, number> }> = {};
    for (const [container, ids] of Object.entries(lists)) {
      const acc = { count: 0, points: 0, byStatus: { TODO: 0, IN_PROGRESS: 0, IN_REVIEW: 0, DONE: 0 } as Record<IssueStatus, number> };
      for (const id of ids) {
        const i = byId[id];
        if (!i) continue;
        acc.count++;
        acc.points += i.storyPoints ?? 0;
        acc.byStatus[i.status]++;
      }
      out[container] = acc;
    }
    return out;
  }, [lists, byId]);

  const doneInfo = (s: SprintData) => {
    const ids = lists[s.id] ?? [];
    let doneCount = 0, openCount = 0, donePoints = 0;
    for (const id of ids) {
      const i = byId[id];
      if (!i) continue;
      if (i.status === "DONE") { doneCount++; donePoints += i.storyPoints ?? 0; } else openCount++;
    }
    return { doneCount, openCount, donePoints };
  };

  return (
    <div>
      {/* Barra de filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          className="field-sm w-full sm:w-56"
          placeholder="Filtrar por clave o título…"
          value={filters.text}
          onChange={(e) => setFilters({ ...filters, text: e.target.value })}
          aria-label="Filtrar tickets"
        />
        <select className="field-sm" value={filters.assignee} onChange={(e) => setFilters({ ...filters, assignee: e.target.value })} aria-label="Encargado">
          <option value="">Todos los encargados</option>
          <option value="none">Sin asignar</option>
          {options.members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}{m.id === currentUserId ? " (yo)" : ""}</option>
          ))}
        </select>
        <select className="field-sm" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {ISSUE_TYPES.filter((t) => t !== "EPIC").map((t) => (
            <option key={t} value={t}>{ISSUE_TYPE_META[t].plural}</option>
          ))}
        </select>
        {options.epics.length > 0 && (
          <select className="field-sm" value={filters.epic} onChange={(e) => setFilters({ ...filters, epic: e.target.value })} aria-label="Épica">
            <option value="">Todas las épicas</option>
            <option value="none">Sin épica</option>
            {options.epics.map((ep) => (
              <option key={ep.id} value={ep.id}>{ep.key} {ep.title}</option>
            ))}
          </select>
        )}
        {filtersActive && (
          <button className="btn-ghost btn-sm" onClick={() => setFilters(NO_FILTERS)}>Limpiar filtros</button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {completedSprints > 0 && <span className="hidden text-xs text-ink-faint sm:inline">{completedSprints} {completedSprints === 1 ? "sprint completado" : "sprints completados"} · ver en Reportes</span>}
          <a className="btn-ghost btn-sm" href={`/api/projects/${projectId}/export`} download title="Descargar todos los tickets del proyecto en Excel">
            Exportar Excel
          </a>
          <a className="btn-ghost btn-sm" href={`/api/projects/${projectId}/export?mine=1`} download title="Descargar solo mis tickets en Excel">
            Mis tareas (Excel)
          </a>
          <button className="btn-ghost btn-sm" disabled={creatingSprint} onClick={createSprint}>
            <PlusIcon size={14} /> Crear sprint
          </button>
          <button className="btn-primary btn-sm" onClick={() => setCreateFor({ open: true, sprintId: null })}>
            <PlusIcon size={14} /> Crear ticket <span className="kbd ml-1">C</span>
          </button>
        </div>
      </div>

      {filtersActive && <p className="mb-3 text-xs text-ink-faint">Con filtros activos no se puede arrastrar. Limpialos para reordenar.</p>}

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setActiveId(null); router.refresh(); }}>
        <div className="space-y-5">
          {ordered.map((s) => {
            const info = summary[s.id];
            const ids = (lists[s.id] ?? []).filter((id) => byId[id] && matches(byId[id]));
            const isCollapsed = collapsed.has(s.id);
            const left = s.state === "ACTIVE" ? daysRemaining(s.endDate ? new Date(s.endDate) : null) : null;
            return (
              <section key={s.id} className="border-2 border-ink bg-card">
                <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b-2 border-ink bg-card-2 px-3 py-2.5">
                  <button onClick={() => toggleCollapsed(s.id)} className="text-ink-soft hover:text-ink" aria-label={isCollapsed ? "Expandir" : "Contraer"} aria-expanded={!isCollapsed}>
                    <ChevronIcon open={!isCollapsed} size={16} />
                  </button>
                  <h2 className="font-display text-base font-extrabold text-ink">{s.name}</h2>
                  <SprintStateLozenge state={s.state} />
                  {(s.startDate || s.endDate) && (
                    <span className="text-xs text-ink-faint">
                      {formatDate(s.startDate)} – {formatDate(s.endDate)}
                      {left !== null ? ` · ${left < 0 ? "vencido" : `${left} d restantes`}` : ""}
                    </span>
                  )}
                  <span className="ml-auto flex flex-wrap items-center gap-2">
                    <SummaryChips info={info} />
                    {s.state === "PLANNED" ? (
                      <button
                        className="btn-mint btn-sm"
                        disabled={!!activeSprint || (info?.count ?? 0) === 0}
                        title={activeSprint ? "Ya hay un sprint activo: completalo primero" : (info?.count ?? 0) === 0 ? "Agregá tickets al sprint" : undefined}
                        onClick={() => setStartFor(s)}
                      >
                        Iniciar sprint
                      </button>
                    ) : (
                      <button className="btn-mint btn-sm" onClick={() => setCompleteFor(s)}>Completar sprint</button>
                    )}
                    <button className="btn-ghost btn-sm" onClick={() => setEditFor(s)}>Editar</button>
                    {isLead && s.state === "PLANNED" && (
                      <button className="btn-ghost btn-sm text-danger" onClick={() => deleteSprint(s)}>Eliminar</button>
                    )}
                  </span>
                </header>
                {s.goal && !isCollapsed && <p className="border-b-2 border-line-strong px-3 py-2 text-xs text-ink-soft"><b className="text-ink">Objetivo:</b> {s.goal}</p>}
                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                      <IssueList
                        readyItems={options.readyItems}
                        container={s.id}
                        ids={ids}
                        byId={byId}
                        disabled={filtersActive}
                        selected={selected}
                        onToggleSelect={toggleSelect}
                        onStatusChange={changeStatus}
                        onOpen={(i) => openIssue(i.key)}
                        emptyText={s.state === "ACTIVE" ? "Sprint sin tickets. Arrastrá desde el backlog." : "Arrastrá tickets desde el backlog para planificar este sprint."}
                      />
                      <QuickCreate onCreate={(t) => quickCreate(t, s.id)} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            );
          })}

          {/* Backlog */}
          <section className="border-2 border-ink bg-card">
            <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b-2 border-ink bg-card-2 px-3 py-2.5">
              <button onClick={() => toggleCollapsed(BACKLOG)} className="text-ink-soft hover:text-ink" aria-label={collapsed.has(BACKLOG) ? "Expandir" : "Contraer"} aria-expanded={!collapsed.has(BACKLOG)}>
                <ChevronIcon open={!collapsed.has(BACKLOG)} size={16} />
              </button>
              <h2 className="font-display text-base font-extrabold text-ink">Backlog</h2>
              <span className="text-xs text-ink-faint">{summary[BACKLOG]?.count ?? 0} tickets</span>
              <span className="ml-auto"><SummaryChips info={summary[BACKLOG]} /></span>
            </header>
            <AnimatePresence initial={false}>
              {!collapsed.has(BACKLOG) && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                  <IssueList
                        readyItems={options.readyItems}
                    container={BACKLOG}
                    ids={(lists[BACKLOG] ?? []).filter((id) => byId[id] && matches(byId[id]))}
                    byId={byId}
                    disabled={filtersActive}
                    selected={selected}
                    onToggleSelect={toggleSelect}
                    onStatusChange={changeStatus}
                    onOpen={(i) => openIssue(i.key)}
                    emptyText="El backlog está vacío. Creá tickets con el botón o la tecla C."
                  />
                  <QuickCreate onCreate={(t) => quickCreate(t, null)} />
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {ordered.length === 0 && (
            <EmptyState
              title="Todavía no hay sprints"
              hint="Creá un sprint, arrastrá tickets del backlog y arrancalo para verlo en el tablero."
              action={<button className="btn-primary btn-sm" onClick={createSprint}>Crear el primer sprint</button>}
            />
          )}
        </div>

        <DragOverlay dropAnimation={{ duration: 160 }}>
          {activeIssue ? <IssueRowView issue={activeIssue} dragging /> : null}
        </DragOverlay>
      </DndContext>

      {/* Barra de acciones en lote */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit max-w-[95vw] flex-wrap items-center gap-2 border-2 border-ink bg-card px-4 py-3 shadow-hard-purple"
          >
            <span className="mr-1 text-sm font-bold text-ink">{selected.size} seleccionados</span>
            <select className="field-sm" value="" onChange={(e) => e.target.value && bulk({ sprintId: e.target.value === BACKLOG ? null : e.target.value })} aria-label="Mover a">
              <option value="">Mover a…</option>
              <option value={BACKLOG}>Backlog</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select className="field-sm" value="" onChange={(e) => e.target.value && bulk({ assigneeUserId: e.target.value === "none" ? null : e.target.value })} aria-label="Asignar a">
              <option value="">Asignar a…</option>
              <option value="none">Sin asignar</option>
              {options.members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <select className="field-sm" value="" onChange={(e) => e.target.value && bulk({ priority: e.target.value })} aria-label="Prioridad">
              <option value="">Prioridad…</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{PRIORITY_META[p].label}</option>
              ))}
            </select>
            <select className="field-sm" value="" onChange={(e) => e.target.value && bulk({ status: e.target.value })} aria-label="Estado">
              <option value="">Estado…</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_META[s].label}</option>
              ))}
            </select>
            <button className="btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Cancelar</button>
          </motion.div>
        )}
      </AnimatePresence>

      <CreateIssueModal
        open={createFor.open}
        onClose={() => setCreateFor({ open: false, sprintId: null })}
        projectId={projectId}
        options={options}
        defaultSprintId={createFor.sprintId}
        currentUserId={currentUserId}
      />

      {startFor && (
        <StartSprintModal
          open
          onClose={() => setStartFor(null)}
          projectId={projectId}
          sprint={startFor}
          issueCount={summary[startFor.id]?.count ?? 0}
          points={summary[startFor.id]?.points ?? 0}
          isLead={isLead}
          notReady={(lists[startFor.id] ?? [])
            .map((id) => byId[id])
            .filter(Boolean)
            .map((i) => ({ key: i.key, title: i.title, missing: options.readyItems.filter((r) => !i.readyDone.includes(r)) }))
            .filter((i) => i.missing.length > 0)}
        />
      )}
      {completeFor && (
        <CompleteSprintModal
          open
          onClose={() => setCompleteFor(null)}
          sprint={completeFor}
          {...doneInfo(completeFor)}
          plannedSprints={planned.filter((p) => p.id !== completeFor.id).map((p) => ({ id: p.id, name: p.name }))}
        />
      )}
      {editFor && <EditSprintModal sprint={editFor} onClose={() => setEditFor(null)} />}
    </div>
  );
}

function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const copy = list.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

function SummaryChips({ info }: { info?: { count: number; points: number; byStatus: Record<IssueStatus, number> } }) {
  if (!info) return null;
  return (
    <span className="flex items-center gap-1" aria-label="Resumen del sprint">
      {STATUSES.map((s) => (
        <span key={s} title={STATUS_META[s].label} className="inline-flex h-[20px] min-w-[20px] items-center justify-center border-2 px-1 font-mono text-[10px] font-bold" style={{ borderColor: STATUS_META[s].color, color: STATUS_META[s].color }}>
          {info.byStatus[s]}
        </span>
      ))}
      <span title="Story points totales" className="ml-1 inline-flex h-[20px] min-w-[20px] items-center justify-center border-2 border-ink bg-ink px-1 font-mono text-[10px] font-bold text-[#150b22]">
        {info.points}
      </span>
    </span>
  );
}

function IssueList({
  container,
  ids,
  byId,
  disabled,
  selected,
  onToggleSelect,
  onStatusChange,
  onOpen,
  emptyText,
  readyItems,
}: {
  container: string;
  readyItems: string[];
  ids: string[];
  byId: Record<string, IssueCardData>;
  disabled: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onStatusChange: (issue: IssueCardData, status: IssueStatus) => void;
  onOpen: (issue: IssueCardData) => void;
  emptyText: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: container });
  return (
    <div ref={setNodeRef} className={cn("min-h-[44px] transition-colors", isOver && "bg-card-2")}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={disabled}>
        {ids.map((id) => (
          <SortableRow
            key={id}
            issue={byId[id]}
            disabled={disabled}
            selected={selected.has(id)}
            onToggleSelect={onToggleSelect}
            onStatusChange={(s) => onStatusChange(byId[id], s)}
            onOpen={() => onOpen(byId[id])}
            readyItems={readyItems}
          />
        ))}
      </SortableContext>
      {ids.length === 0 && <p className="border-b-2 border-dashed border-line-strong px-3 py-3 text-center text-xs text-ink-faint">{emptyText}</p>}
    </div>
  );
}

function SortableRow({
  issue,
  disabled,
  selected,
  onToggleSelect,
  onStatusChange,
  onOpen,
  readyItems,
}: {
  readyItems: string[];
  issue: IssueCardData;
  disabled: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onStatusChange: (status: IssueStatus) => void;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: issue.id, disabled });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}>
      <IssueRowView
        issue={issue}
        selected={selected}
        onToggleSelect={onToggleSelect}
        onStatusChange={onStatusChange}
        onOpen={onOpen}
        readyItems={readyItems}
        handleProps={disabled ? undefined : { ...attributes, ...listeners }}
      />
    </div>
  );
}

function QuickCreate({ onCreate }: { onCreate: (title: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    const ok = await onCreate(title.trim());
    setBusy(false);
    if (ok) setTitle("");
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-ink-faint hover:bg-card-2 hover:text-ink">
        <PlusIcon size={13} /> Crear ticket
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="flex items-center gap-2 px-3 py-2">
      <input
        autoFocus
        className="field-sm flex-1"
        placeholder="¿Qué hay que hacer? (Enter para crear, Esc para cerrar)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setTitle("");
          }
        }}
        maxLength={300}
      />
      <button className="btn-primary btn-sm" disabled={busy || !title.trim()}>Crear</button>
    </form>
  );
}

function EditSprintModal({ sprint, onClose }: { sprint: SprintData; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(sprint.name);
  const [goal, setGoal] = useState(sprint.goal);
  const [start, setStart] = useState(sprint.startDate?.slice(0, 10) ?? "");
  const [end, setEnd] = useState(sprint.endDate?.slice(0, 10) ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await api(`/api/sprints/${sprint.id}`, "PATCH", {
      name,
      goal,
      startDate: start ? `${start}T00:00:00.000Z` : null,
      endDate: end ? `${end}T23:59:59.000Z` : null,
    });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Sprint actualizado");
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar sprint"
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" form="edit-sprint-form" className="btn-primary" disabled={saving || !name.trim()}>Guardar</button>
        </>
      }
    >
      <form id="edit-sprint-form" onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Nombre</label>
          <input data-autofocus className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Objetivo</label>
          <textarea className="field" rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={500} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Inicio</label>
            <input type="date" className="field" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Fin</label>
            <input type="date" className="field" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
      </form>
    </Modal>
  );
}
