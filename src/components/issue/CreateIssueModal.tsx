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

const EPIC_COLORS = ["#c084fc", "#2fe3a6", "#60a5fa", "#ffb020", "#fb7185", "#8b5cf6"];

export default function CreateIssueModal({
  open,
  onClose,
  projectId,
  options,
  defaultSprintId = null,
  defaultType = "TASK",
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  options: ProjectOptions;
  defaultSprintId?: string | null;
  defaultType?: IssueType;
  currentUserId?: string;
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
    if (open) {
      setType(defaultType);
      setSprintId(defaultSprintId ?? "");
    }
  }, [open, defaultType, defaultSprintId]);

  const isEpic = type === "EPIC";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
      title="Crear ticket"
      width="max-w-xl"
      footer={
        <>
          <label className="mr-auto flex items-center gap-2 text-xs text-ink-soft">
            <input type="checkbox" className="accent-moss" checked={another} onChange={(e) => setAnother(e.target.checked)} />
            Crear otro
          </label>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" form="create-issue-form" className="btn-primary" disabled={saving || !title.trim()}>
            {saving ? "Creando…" : "Crear"}
          </button>
        </>
      }
    >
      <form id="create-issue-form" onSubmit={submit} className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {ISSUE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn(
                "flex items-center gap-2 border-2 px-2.5 py-1.5 text-xs font-bold transition-colors",
                type === t ? "border-moss bg-card-2 text-ink" : "border-line-strong text-ink-faint hover:text-ink"
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
                <button key={c} type="button" aria-label={c} onClick={() => setEpicColor(c)} className={cn("h-7 w-7 border-2", epicColor === c ? "border-ink shadow-hard-sm" : "border-transparent")} style={{ background: c }} />
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
