"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { IssueCardData } from "@/lib/types";
import { api } from "@/lib/client";
import { IssueRowView } from "@/components/issue/IssueViews";
import { useOpenIssue } from "@/components/issue/useOpenIssue";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toaster";
import { cn } from "@/lib/ui";

type Item = { issue: IssueCardData; projectId: string; projectName: string; sprint: string | null };

const DAY = 86400000;

function bucketOf(issue: IssueCardData): "overdue" | "week" | "later" | "none" {
  if (!issue.dueDate) return "none";
  const due = new Date(issue.dueDate).getTime();
  const now = Date.now();
  if (due < now - DAY) return "overdue";
  if (due < now + 7 * DAY) return "week";
  return "later";
}

const BUCKETS = [
  { id: "overdue", label: "Vencidos", color: "text-danger" },
  { id: "week", label: "Esta semana", color: "text-warn" },
  { id: "later", label: "Más adelante", color: "text-ink-soft" },
  { id: "none", label: "Sin fecha límite", color: "text-ink-soft" },
] as const;

export default function MyWorkView({ items }: { items: Item[] }) {
  const router = useRouter();
  const toast = useToast();
  const openIssue = useOpenIssue();
  const [showDone, setShowDone] = useState(false);
  const [project, setProject] = useState("");
  const [local, setLocal] = useState<Record<string, IssueCardData["status"]>>({});

  const projects = useMemo(() => Array.from(new Map(items.map((i) => [i.projectId, i.projectName]))), [items]);
  const statusOf = (i: Item) => local[i.issue.id] ?? i.issue.status;

  const visible = items.filter((i) => (showDone || statusOf(i) !== "DONE") && (!project || i.projectId === project));
  const openTotal = items.filter((i) => statusOf(i) !== "DONE").length;

  async function changeStatus(item: Item, status: IssueCardData["status"]) {
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

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-16 pt-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">Mi trabajo</h1>
          <p className="text-sm text-ink-soft">{openTotal} {openTotal === 1 ? "ticket abierto" : "tickets abiertos"} asignados a vos</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {projects.length > 1 && (
            <select className="field-sm" value={project} onChange={(e) => setProject(e.target.value)} aria-label="Proyecto">
              <option value="">Todos los proyectos</option>
              {projects.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          )}
          <button onClick={() => setShowDone((v) => !v)} aria-pressed={showDone} className={cn("border-2 px-2.5 py-1 text-xs font-bold", showDone ? "border-moss bg-moss text-[#150b22]" : "border-line-strong text-ink-soft hover:text-ink")}>
            Mostrar hechos
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState title={items.length === 0 ? "No tenés tickets asignados" : "Todo al día 🎉"} hint={items.length === 0 ? "Cuando te asignen un ticket aparece acá, ordenado por fecha límite." : "No queda nada pendiente con estos filtros."} action={<Link href="/projects" className="btn-ghost btn-sm">Ver proyectos</Link>} />
      ) : (
        <div className="space-y-6">
          {BUCKETS.map((b) => {
            const group = visible.filter((i) => bucketOf(i.issue) === b.id);
            if (group.length === 0) return null;
            return (
              <section key={b.id} className="border-2 border-ink bg-card">
                <h2 className={cn("flex items-center gap-2 border-b-2 border-ink bg-card-2 px-3 py-2 text-xs font-extrabold uppercase tracking-wide", b.color)}>
                  {b.label} <span className="font-mono text-ink-faint">{group.length}</span>
                </h2>
                {group.map((i) => (
                  <div key={i.issue.id}>
                    <IssueRowView issue={{ ...i.issue, status: statusOf(i) }} onStatusChange={(s) => changeStatus(i, s)} onOpen={() => openIssue(i.issue.key)} />
                    <div className="-mt-1 border-b-2 border-line-strong bg-card px-3 pb-1.5 pl-[3.6rem] text-[11px] text-ink-faint">
                      <Link href={`/projects/${i.projectId}/board`} className="hover:text-moss">{i.projectName}</Link>
                      {i.sprint ? ` · ${i.sprint}` : " · backlog"}
                    </div>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
