"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/ui/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";
import { TypeIcon } from "@/components/ui/Icons";
import { ISSUE_TYPE_META, PRIORITY_META } from "@/lib/scrum/constants";
import type { ProjectOptions } from "@/lib/types";
import type { DraftDTO } from "@/lib/drafts";
import CreateIssueModal from "./CreateIssueModal";

type ProjectRef = { id: string; name: string; key: string | null };

// "Mis borradores": tickets privados que solo ve quien los creó, hasta que los comparte con el equipo (SCP-68).
export default function DraftsPanel({ drafts, projects, options, currentUserId, className }: { drafts: DraftDTO[]; projects: ProjectRef[]; options?: ProjectOptions; currentUserId: string; className?: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<{ draft: DraftDTO; options: ProjectOptions } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const project = (id: string) => projects.find((p) => p.id === id);

  async function edit(d: DraftDTO) {
    if (options && projects.length <= 1) return setEditing({ draft: d, options });
    const res = await api<ProjectOptions>(`/api/projects/${d.projectId}/options`);
    if (!res.ok) return toast.error(res.error);
    setEditing({ draft: d, options: res.data });
  }

  async function share(d: DraftDTO) {
    setBusy(d.id);
    const res = await api(`/api/projects/${d.projectId}/drafts/${d.id}/share`, "POST", {});
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    toast.success("Compartido con el equipo: ya está en el backlog");
    router.refresh();
  }

  async function remove(d: DraftDTO) {
    if (!(await confirm(`¿Borrar el borrador "${d.title}"?`, { confirmLabel: "Borrar", danger: true }))) return;
    const res = await api(`/api/projects/${d.projectId}/drafts/${d.id}`, "DELETE");
    if (!res.ok) return toast.error(res.error);
    router.refresh();
  }

  if (drafts.length === 0) return null;
  return (
    <section className={className}>
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-extrabold text-ink">
        Mis borradores <span className="lozenge text-ink-soft">privados</span> <span className="font-mono text-sm text-ink-faint">{drafts.length}</span>
      </h2>
      <p className="mb-2 text-xs text-ink-faint">Solo tú los ves. Cuando estén listos, compártelos con el equipo y pasan al backlog.</p>
      <ul className="divide-y divide-line-strong rounded-lg border border-dashed border-line-strong bg-card">
        {drafts.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <TypeIcon type={d.issueType} size={16} />
            <button className="min-w-0 flex-[1_1_calc(100%-2rem)] truncate text-left text-sm font-semibold text-ink hover:text-rust sm:flex-1" onClick={() => edit(d)} title="Editar el borrador">
              {d.title}
            </button>
            {project(d.projectId) && projects.length > 1 && <span className="rounded border border-line px-1.5 font-mono text-[11px] text-ink-soft">{project(d.projectId)!.key ?? project(d.projectId)!.name}</span>}
            <span className="hidden text-[11px] text-ink-faint sm:inline">{ISSUE_TYPE_META[d.issueType].label} · {PRIORITY_META[d.priority].label}</span>
            <button className="btn-ghost btn-sm" onClick={() => edit(d)}>Editar</button>
            <button className="btn-primary btn-sm" disabled={busy === d.id} onClick={() => share(d)}>{busy === d.id ? "Compartiendo…" : "Compartir con el equipo"}</button>
            <button className="text-xs text-ink-faint hover:text-danger" onClick={() => remove(d)} aria-label={`Borrar el borrador ${d.title}`}>Borrar</button>
          </li>
        ))}
      </ul>
      {editing && <CreateIssueModal open onClose={() => setEditing(null)} projectId={editing.draft.projectId} options={editing.options} draft={editing.draft} currentUserId={currentUserId} />}
    </section>
  );
}
