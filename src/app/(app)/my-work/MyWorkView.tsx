"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { IssueCardData } from "@/lib/types";
import { api } from "@/lib/client";
import { STATUSES, STATUS_META, PRIORITY_META, type IssueStatus } from "@/lib/scrum/constants";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import KanbanBoard, { type GroupBy } from "@/components/board/KanbanBoard";
import { DueBadge } from "@/components/issue/IssueViews";
import { useOpenIssue } from "@/components/issue/useOpenIssue";
import EmptyState from "@/components/ui/EmptyState";
import { PriorityIcon, TypeIcon } from "@/components/ui/Icons";
import { PointsBadge } from "@/components/ui/Lozenge";
import { useToast } from "@/components/ui/Toaster";
import { cn } from "@/lib/ui";

type Item = { issue: IssueCardData; projectId: string; projectName: string; projectColor: string | null; sprint: string | null };
type View = "board" | "table";

// Mi trabajo: mis tickets de todos los proyectos con el mismo tablero Kanban que dentro de un proyecto, o en tabla.
// Se puede ver todo junto o un proyecto a la vez.
export default function MyWorkView({ items }: { items: Item[] }) {
  const router = useRouter();
  const toast = useToast();
  const openIssue = useOpenIssue();
  const [view, setView] = useState<View>("board");
  const [project, setProject] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [showDone, setShowDone] = useState(false); // solo en la tabla: el tablero ya recoge lo terminado en su columna Hecho
  const [dragging, setDragging] = useState(false);
  const [local, setLocal] = useState<Record<string, IssueStatus>>({});
  useLiveRefresh("/api/live/projects", { paused: dragging });

  useEffect(() => {
    try {
      const saved = localStorage.getItem("mywork-view");
      if (saved === "table" || saved === "board") setView(saved);
    } catch {}
  }, []);
  function changeView(v: View) {
    setView(v);
    try {
      localStorage.setItem("mywork-view", v);
    } catch {}
  }

  const projects = useMemo(() => Array.from(new Map(items.map((i) => [i.projectId, { name: i.projectName, color: i.projectColor }]))).sort((a, b) => a[1].name.localeCompare(b[1].name)), [items]);
  const scoped = useMemo(() => items.filter((i) => !project || i.projectId === project), [items, project]);
  const statusOf = (i: Item) => local[i.issue.id] ?? i.issue.status;
  const openTotal = scoped.filter((i) => statusOf(i) !== "DONE").length;

  // Mover desde el tablero: cada tarjeta se mueve en SU proyecto.
  const moveIssue = useCallback(async (issue: IssueCardData, status: IssueStatus, prevId: string | null, nextId: string | null) => {
    const res = await api(`/api/projects/${issue.projectId}/move`, "POST", { issueId: issue.id, status, prevId, nextId });
    return res.ok ? null : res.error;
  }, []);

  async function changeStatus(item: Item, status: IssueStatus) {
    setLocal((p) => ({ ...p, [item.issue.id]: status }));
    const res = await api(`/api/issues/${item.issue.id}`, "PATCH", { status });
    if (!res.ok) {
      toast.error(res.error);
      setLocal((p) => {
        const { [item.issue.id]: _, ...rest } = p;
        return rest;
      });
    }
    router.refresh();
  }

  const board = useMemo(() => scoped.map((i) => i.issue), [scoped]);
  const tableRows = useMemo(
    () =>
      scoped
        .filter((i) => showDone || statusOf(i) !== "DONE")
        .sort((a, b) => {
          const da = a.issue.dueDate ? new Date(a.issue.dueDate).getTime() : Infinity;
          const db = b.issue.dueDate ? new Date(b.issue.dueDate).getTime() : Infinity;
          return da - db || a.issue.rank - b.issue.rank;
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, showDone, local]
  );

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 pb-16 pt-8 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">Mi trabajo</h1>
          <p className="text-sm text-ink-soft">{openTotal} {openTotal === 1 ? "ticket abierto" : "tickets abiertos"} asignados a ti{project ? " en este proyecto" : ""}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {projects.length > 1 && (
            <select className="field-sm" value={project} onChange={(e) => setProject(e.target.value)} aria-label="Proyecto">
              <option value="">Todos los proyectos</option>
              {projects.map(([id, p]) => (
                <option key={id} value={id}>{p.name}</option>
              ))}
            </select>
          )}
          {view === "board" && projects.length > 1 && !project && (
            <select className="field-sm hidden md:block" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} aria-label="Agrupar por">
              <option value="none">Sin agrupar</option>
              <option value="project">Agrupar por proyecto</option>
            </select>
          )}
          {view === "table" && (
            <button onClick={() => setShowDone((v) => !v)} aria-pressed={showDone} className={cn("border px-2.5 py-1 text-xs font-bold rounded-md", showDone ? "border-rust bg-rust text-white" : "border-line-strong text-ink-soft hover:text-ink")}>
              Mostrar hechos
            </button>
          )}
          <div className="flex rounded-md border border-line" role="group" aria-label="Vista">
            {(["board", "table"] as const).map((v) => (
              <button key={v} onClick={() => changeView(v)} aria-pressed={view === v} className={cn("px-3 py-1 text-xs font-bold", view === v ? "bg-rust text-white" : "text-ink-soft hover:text-ink")}>
                {v === "board" ? "Tablero" : "Tabla"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState title="No tienes tickets asignados" hint="Cuando te asignen un ticket aparece aquí." action={<Link href="/projects" className="btn-ghost btn-sm">Ver proyectos</Link>} />
      ) : view === "board" ? (
        <KanbanBoard issues={board} groupBy={project ? "none" : groupBy} onOpen={(i) => openIssue(i.key)} onMove={moveIssue} onDragging={setDragging} />
      ) : tableRows.length === 0 ? (
        <EmptyState title="Todo al día" hint="No queda nada pendiente con estos filtros." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-card">
          <table className="w-full min-w-[56rem] text-sm">
            <thead>
              <tr className="border-b border-line-strong bg-card-2 text-left text-xs font-semibold text-ink-soft">
                <th className="px-3 py-2">Ticket</th>
                <th className="px-3 py-2">Título</th>
                <th className="px-3 py-2">Proyecto</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Prioridad</th>
                <th className="px-3 py-2">Fecha límite</th>
                <th className="px-3 py-2 text-right">Puntos</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((i) => {
                const st = statusOf(i);
                return (
                  <tr key={i.issue.id} className="cursor-pointer border-b border-line last:border-b-0 hover:bg-card-2" onClick={() => openIssue(i.issue.key)}>
                    <td className="px-3 py-2 font-mono text-xs text-ink-faint"><span className="inline-flex items-center gap-2"><TypeIcon type={i.issue.issueType} size={16} />{i.issue.key}</span></td>
                    <td className={cn("max-w-[26rem] truncate px-3 py-2 font-medium", st === "DONE" ? "text-ink-faint line-through" : "text-ink")} title={i.issue.title}>{i.issue.title}</td>
                    <td className="px-3 py-2">
                      <Link href={`/projects/${i.projectId}/board`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 text-ink-soft hover:text-ink hover:underline">
                        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: i.projectColor ?? "var(--ink-faint)" }} />
                        {i.projectName}
                      </Link>
                      <span className="ml-1 text-[11px] text-ink-faint">{i.sprint ? `· ${i.sprint}` : "· backlog"}</span>
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <select
                        aria-label={`Estado de ${i.issue.key}`}
                        value={st}
                        onChange={(e) => changeStatus(i, e.target.value as IssueStatus)}
                        className="lozenge cursor-pointer bg-transparent outline-none"
                        style={{ color: STATUS_META[st].color }}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s} className="bg-card text-ink">{STATUS_META[s].label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5 text-xs text-ink-soft"><PriorityIcon priority={i.issue.priority} />{PRIORITY_META[i.issue.priority].label}</span></td>
                    <td className="px-3 py-2"><DueBadge dueDate={i.issue.dueDate} done={st === "DONE"} />{!i.issue.dueDate && <span className="text-xs text-ink-faint">—</span>}</td>
                    <td className="px-3 py-2 text-right"><PointsBadge points={i.issue.storyPoints} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
