"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toaster";
import { TypeIcon } from "@/components/ui/Icons";
import { api } from "@/lib/client";
import { ISSUE_TYPES, ISSUE_TYPE_META, PRIORITIES, PRIORITY_META, STORY_POINT_OPTIONS, type IssueType, type Priority } from "@/lib/scrum/constants";
import type { ProjectOptions } from "@/lib/types";
import { cn } from "@/lib/ui";
import { useOpenIssue } from "./useOpenIssue";
import type { DraftDTO } from "@/lib/drafts";

const EPIC_COLORS = ["#8b5cf6", "#14b88a", "#3b82f6", "#f59e0b", "#ef4444", "#a78bfa"];

export default function CreateIssueModal({
  open,
  onClose,
  projectId,
  options,
  defaultSprintId = null,
  defaultType = "TASK",
  currentUserId,
  draft = null,
  projectPicker,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  options: ProjectOptions;
  defaultSprintId?: string | null;
  defaultType?: IssueType;
  currentUserId?: string;
  // Editar un borrador privado ya guardado (se puede guardar de nuevo o compartir con el equipo).
  draft?: DraftDTO | null;
  // Crear desde cualquier pantalla: el proyecto se elige arriba.
  projectPicker?: { projects: Array<{ id: string; name: string; key: string | null }>; onChange: (id: string) => void };
}) {
  const router = useRouter();
  const toast = useToast();
  const openIssue = useOpenIssue();
  const [type, setType] = useState<IssueType>(defaultType);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIA");
  const [points, setPoints] = useState("");
  const [assignee, setAssignee] = useState("");
  const [sprintId, setSprintId] = useState(defaultSprintId ?? "");
  const [epicId, setEpicId] = useState("");
  const [another, setAnother] = useState(false);
  const [epicColor, setEpicColor] = useState(EPIC_COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (draft) {
      setType(draft.issueType);
      setTitle(draft.title);
      setDescription(draft.description);
      setPriority(draft.priority);
      setPoints(draft.storyPoints != null ? String(draft.storyPoints) : "");
      setAssignee(draft.assigneeUserId ?? "");
      setEpicId(draft.epicId ?? "");
      setSprintId("");
    } else {
      setType(defaultType);
      setSprintId(defaultSprintId ?? "");
    }
  }, [open, defaultType, defaultSprintId, draft]);

  const isEpic = type === "EPIC";

  const draftBody = () => ({
    title,
    description: description || undefined,
    issueType: type,
    priority,
    storyPoints: !isEpic && points ? Number(points) : undefined,
    assigneeUserId: assignee || undefined,
    epicId: !isEpic && epicId ? epicId : undefined,
  });

  // Guarda (o actualiza) el borrador privado: solo lo ve quien lo crea hasta que lo comparta con el equipo.
  async function saveDraft(): Promise<DraftDTO | null> {
    if (!title.trim()) return null;
    setSaving(true);
    const res = draft
      ? await api<DraftDTO>(`/api/projects/${projectId}/drafts/${draft.id}`, "PATCH", { ...draftBody(), storyPoints: !isEpic && points ? Number(points) : null, assigneeUserId: assignee || null, epicId: !isEpic && epicId ? epicId : null, description })
      : await api<DraftDTO>(`/api/projects/${projectId}/drafts`, "POST", draftBody());
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return null;
    }
    return res.data;
  }

  async function onSaveDraft() {
    const saved = await saveDraft();
    if (!saved) return;
    toast.success("Borrador guardado: solo tú lo ves");
    setTitle("");
    setDescription("");
    setPoints("");
    router.refresh();
    onClose();
  }

  async function onShareDraft() {
    const saved = await saveDraft();
    if (!saved) return;
    setSaving(true);
    const res = await api(`/api/projects/${projectId}/drafts/${saved.id}/share`, "POST", { sprintId: sprintId || null });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Compartido con el equipo");
    setTitle("");
    setDescription("");
    router.refresh();
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (draft) return void onShareDraft();
    if (!title.trim()) return;
    setSaving(true);
    const res = await api<{ number: number }>(`/api/projects/${projectId}/issues`, "POST", {
      title,
      description: description || undefined,
      issueType: type,
      priority,
      storyPoints: !isEpic && points ? Number(points) : undefined,
      assigneeUserId: assignee || undefined,
      sprintId: !isEpic && sprintId ? sprintId : undefined,
      epicId: !isEpic && epicId ? epicId : undefined,
      epicColor: isEpic ? epicColor : undefined,
    });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);

    toast.success(`${ISSUE_TYPE_META[type].label} creado`);
    setTitle("");
    setDescription("");
    setPoints("");
    router.refresh();
    if (!another) onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={draft ? "Borrador privado" : "Crear ticket"}
      width="max-w-xl"
      footer={
        <>
          {draft ? (
            <span className="mr-auto text-xs text-ink-faint">Solo tú ves este borrador.</span>
          ) : (
            <label className="mr-auto flex items-center gap-2 text-xs text-ink-soft">
              <input type="checkbox" className="accent-moss" checked={another} onChange={(e) => setAnother(e.target.checked)} />
              Crear otro
            </label>
          )}
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-ghost" disabled={saving || !title.trim()} onClick={onSaveDraft} title="Guárdalo en privado: nadie más lo ve hasta que lo compartas con el equipo">
            {draft ? "Guardar cambios" : "Guardar borrador privado"}
          </button>
          <button type="submit" form="create-issue-form" className="btn-primary" disabled={saving || !title.trim()}>
            {saving ? "Un momento…" : draft ? "Compartir con el equipo" : "Crear"}
          </button>
        </>
      }
    >
      <form id="create-issue-form" onSubmit={submit} className="space-y-4">
        {projectPicker && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Proyecto</label>
            <select className="field" value={projectId} onChange={(e) => projectPicker.onChange(e.target.value)}>
              {projectPicker.projects.map((p) => (
                <option key={p.id} value={p.id}>{p.key ? `${p.key} · ` : ""}{p.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {ISSUE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn(
                "flex items-center gap-2 border px-2.5 py-1.5 text-xs font-bold transition-colors rounded-md",
                type === t ? "border-rust bg-card-2 text-rust" : "border-line-strong text-ink-faint hover:text-ink"
              )}
            >
              <TypeIcon type={t} size={16} /> {ISSUE_TYPE_META[t].label}
            </button>
          ))}
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Título *</label>
          <input data-autofocus className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isEpic ? "Ej: Facturación electrónica" : "¿Qué hay que hacer?"} maxLength={300} />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Descripción</label>
          <textarea className="field" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional: contexto, criterios de aceptación…" />
        </div>

        {isEpic && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Color de la épica</label>
            <div className="flex gap-2">
              {EPIC_COLORS.map((c) => (
                <button key={c} type="button" aria-label={c} onClick={() => setEpicColor(c)} className={cn("h-7 w-7 border rounded-md", epicColor === c ? "border-line shadow-hard-sm" : "border-transparent")} style={{ background: c }} />
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Prioridad</label>
            <select className="field" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{PRIORITY_META[p].label}</option>
              ))}
            </select>
          </div>
          {!isEpic && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-soft">Story points</label>
              <select className="field" value={points} onChange={(e) => setPoints(e.target.value)}>
                <option value="">Sin estimar</option>
                {STORY_POINT_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Encargado</label>
            <select className="field" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Sin asignar</option>
              {options.members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}{m.id === currentUserId ? " (yo)" : ""}</option>
              ))}
            </select>
          </div>
          {!isEpic && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-soft">Sprint</label>
              <select className="field" value={sprintId} onChange={(e) => setSprintId(e.target.value)}>
                <option value="">Backlog</option>
                {options.sprints.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.state === "ACTIVE" ? " (activo)" : ""}</option>
                ))}
              </select>
            </div>
          )}
          {!isEpic && options.epics.length > 0 && (
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-semibold text-ink-soft">Épica</label>
              <select className="field" value={epicId} onChange={(e) => setEpicId(e.target.value)}>
                <option value="">Sin épica</option>
                {options.epics.map((ep) => (
                  <option key={ep.id} value={ep.id}>{ep.key} {ep.title}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
