"use client";

import { useCallback, useMemo, useState } from "react";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/client";
import { cn, pct } from "@/lib/ui";
import { daysRemaining } from "@/lib/scrum/sprintLifecycle";
import type { IssueStatus } from "@/lib/scrum/constants";
import type { IssueCardData, ProjectOptions, SprintData } from "@/lib/types";
import CreateIssueModal from "@/components/issue/CreateIssueModal";
import { useOpenIssue } from "@/components/issue/useOpenIssue";
import KanbanBoard, { type GroupBy } from "@/components/board/KanbanBoard";
import { CompleteSprintModal } from "@/components/sprint/SprintModals";
import { ProgressBar } from "@/components/ui/Motion";
import { PlusIcon } from "@/components/ui/Icons";

export default function BoardView({
  projectId,
  sprint,
  issues,
  options,
  currentUserId,
  plannedSprints,
  allTasks = false,
  activeSprint = null,
}: {
  projectId: string;
  sprint: SprintData;
  issues: IssueCardData[];
  options: ProjectOptions;
  currentUserId: string;
  plannedSprints: Array<{ id: string; name: string }>;
  allTasks?: boolean; // se muestran todas las tareas del proyecto (no solo las del sprint activo)
  activeSprint?: { id: string; name: string } | null; // si hay sprint activo, se puede alternar entre él y todas las tareas
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const openIssue = useOpenIssue();

  const [dragging, setDragging] = useState(false);
  useLiveRefresh(`/api/projects/${projectId}/live`, { paused: dragging });
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

  // Guarda un movimiento del tablero (columna y posición).
  const moveIssue = useCallback(
    async (issue: IssueCardData, status: IssueStatus, prevId: string | null, nextId: string | null) => {
      const res = await api(`/api/projects/${projectId}/move`, "POST", { issueId: issue.id, status, prevId, nextId });
      return res.ok ? null : res.error;
    },
    [projectId]
  );

  const totals = useMemo(() => {
    let done = 0, total = 0, donePts = 0, totalPts = 0;
    for (const i of issues) {
      total++;
      totalPts += i.storyPoints ?? 0;
      if (i.status === "DONE") { done++; donePts += i.storyPoints ?? 0; }
    }
    return { done, total, donePts, totalPts, percent: totalPts > 0 ? pct(donePts, totalPts) : pct(done, total) };
  }, [issues]);

  const noSprint = allTasks;
  function switchScope(v: "sprint" | "todas") {
    const next = new URLSearchParams(params.toString());
    if (v === "todas") next.set("vista", "todas");
    else next.delete("vista");
    const q = next.toString();
    router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }

  const left = noSprint ? null : daysRemaining(sprint.endDate ? new Date(sprint.endDate) : null);
  const openCount = totals.total - totals.done;

  return (
    <div>
      {/* Encabezado del sprint */}
      <div className="mb-5 border border-line bg-card p-4 rounded-lg">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="font-display text-xl font-extrabold text-ink">{sprint.name}</h2>
          {activeSprint && (
            <div className="flex rounded-md border border-line" role="group" aria-label="Qué tareas mostrar">
              {([["sprint", `Sprint activo`], ["todas", "Todas las tareas"]] as const).map(([v, l]) => (
                <button key={v} type="button" onClick={() => switchScope(v)} aria-pressed={(v === "todas") === allTasks} title={v === "sprint" ? activeSprint.name : "Todas las tareas del proyecto, de todos los sprints y el backlog"} className={cn("px-3 py-1 text-xs font-bold", (v === "todas") === allTasks ? "bg-rust text-white" : "text-ink-soft hover:text-ink")}>{l}</button>
              ))}
            </div>
          )}
          {!activeSprint && <span className="lozenge text-ink-soft" title="No hay un sprint activo: el tablero muestra todas las tareas">Sin sprint activo · todas las tareas</span>}
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
            {!noSprint && <button className="btn-mint btn-sm" onClick={() => setCompleting(true)}>Completar sprint</button>}
          </div>
        </div>
        {!noSprint && sprint.goal && <p className="mt-2 text-sm text-ink-soft"><b className="text-ink">Objetivo:</b> {sprint.goal}</p>}
        <div className="mt-3">
          <ProgressBar value={totals.percent} />
        </div>
      </div>

      {/* Filtros */}
      <div className="-mx-4 mb-4 flex items-center gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&>*]:shrink-0">
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
        <select className="field-sm ml-auto hidden md:block" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} aria-label="Agrupar por">
          <option value="none">Sin agrupar</option>
          <option value="assignee">Agrupar por encargado</option>
          <option value="epic">Agrupar por épica</option>
        </select>
      </div>

      <KanbanBoard issues={visible} groupBy={groupBy} onOpen={(i) => openIssue(i.key)} onMove={moveIssue} onDragging={setDragging} />

      {issues.length === 0 && <p className="mt-4 text-center text-sm text-ink-faint">{allTasks ? "Este proyecto todavía no tiene tareas. Crea la primera con «Crear ticket»." : "El sprint no tiene tickets. Sumalos desde el backlog."}</p>}

      <CreateIssueModal open={creating} onClose={() => setCreating(false)} projectId={projectId} options={options} defaultSprintId={activeSprint?.id ?? (allTasks ? null : sprint.id)} currentUserId={currentUserId} />
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
