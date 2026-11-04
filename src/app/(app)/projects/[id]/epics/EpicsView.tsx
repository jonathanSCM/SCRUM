"use client";

import { useState } from "react";
import { motion } from "motion/react";
import type { IssueCardData, ProjectOptions } from "@/lib/types";
import { pct } from "@/lib/ui";
import { IssueRowView } from "@/components/issue/IssueViews";
import CreateIssueModal from "@/components/issue/CreateIssueModal";
import { useOpenIssue } from "@/components/issue/useOpenIssue";
import { ProgressBar, staggerChild, staggerParent } from "@/components/ui/Motion";
import { ChevronIcon, PlusIcon, TypeIcon } from "@/components/ui/Icons";
import EmptyState from "@/components/ui/EmptyState";

export type EpicRow = {
  id: string;
  key: string;
  title: string;
  description: string;
  color: string | null;
  status: string;
  issues: IssueCardData[];
};

export default function EpicsView({ projectId, epics, options, currentUserId }: { projectId: string; epics: EpicRow[]; options: ProjectOptions; currentUserId: string }) {
  const openIssue = useOpenIssue();
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center">
        <p className="text-sm text-ink-soft">Las épicas agrupan tickets grandes. El progreso se calcula con los puntos (o la cantidad de tickets) hechos.</p>
        <button className="btn-primary btn-sm ml-auto shrink-0" onClick={() => setCreating(true)}>
          <PlusIcon size={14} /> Crear épica
        </button>
      </div>

      {epics.length === 0 ? (
        <EmptyState
          title="Todavía no hay épicas"
          hint="Una épica es un objetivo grande (por ejemplo “Facturación”) que reúne varias historias y tareas."
          action={<button className="btn-primary btn-sm" onClick={() => setCreating(true)}>Crear la primera épica</button>}
        />
      ) : (
        <motion.ul variants={staggerParent} initial="hidden" animate="show" className="space-y-3">
          {epics.map((epic) => {
            const total = epic.issues.length;
            const done = epic.issues.filter((i) => i.status === "DONE").length;
            const totalPts = epic.issues.reduce((n, i) => n + (i.storyPoints ?? 0), 0);
            const donePts = epic.issues.filter((i) => i.status === "DONE").reduce((n, i) => n + (i.storyPoints ?? 0), 0);
            const percent = totalPts > 0 ? pct(donePts, totalPts) : pct(done, total);
            const open = expanded.has(epic.id);
            return (
              <motion.li key={epic.id} variants={staggerChild} className="border-2 border-ink bg-card" style={{ borderLeftWidth: 8, borderLeftColor: epic.color ?? "#c084fc" }}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <button onClick={() => toggle(epic.id)} aria-expanded={open} aria-label={open ? "Contraer" : "Expandir"} className="text-ink-soft hover:text-ink">
                    <ChevronIcon open={open} size={16} />
                  </button>
                  <TypeIcon type="EPIC" size={20} />
                  <button onClick={() => openIssue(epic.key)} className="font-mono text-xs text-ink-faint hover:text-moss">{epic.key}</button>
                  <button onClick={() => openIssue(epic.key)} className="font-display text-base font-extrabold text-ink hover:underline">{epic.title}</button>
                  <span className="ml-auto font-mono text-xs text-ink-faint">
                    {done}/{total} tickets{totalPts > 0 ? ` · ${donePts}/${totalPts} pts` : ""} · <b className="text-ink">{percent}%</b>
                  </span>
                </div>
                <div className="px-4 pb-3">
                  <ProgressBar value={percent} color={epic.color ?? undefined} height={10} />
                </div>
                {open && (
                  <div className="border-t-2 border-line-strong">
                    {total === 0 ? (
                      <p className="px-4 py-4 text-center text-xs text-ink-faint">Esta épica no tiene tickets. Asignala desde el panel de cada ticket.</p>
                    ) : (
                      epic.issues.map((i) => <IssueRowView key={i.id} issue={i} onOpen={() => openIssue(i.key)} />)
                    )}
                  </div>
                )}
              </motion.li>
            );
          })}
        </motion.ul>
      )}

      <CreateIssueModal open={creating} onClose={() => setCreating(false)} projectId={projectId} options={options} defaultType="EPIC" currentUserId={currentUserId} />
    </div>
  );
}
