"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { cn, timeAgo } from "@/lib/ui";
import { NOTE_KIND_META, extractActionItems, isNoteKind, type NoteKind } from "@/lib/scrum/notes";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import Avatar from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";
import { PlusIcon } from "@/components/ui/Icons";

export type NoteRow = {
  id: string;
  title: string;
  body: string;
  kind: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string } | null;
};

const KINDS = Object.keys(NOTE_KIND_META) as NoteKind[];

export default function NotesView({ projectId, notes, currentUserId, isLead }: { projectId: string; notes: NoteRow[]; currentUserId: string; isLead: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [filter, setFilter] = useState<"ALL" | NoteKind>("ALL");
  const [editing, setEditing] = useState<NoteRow | "new" | null>(null);
  const [converting, setConverting] = useState<NoteRow | null>(null);

  const visible = useMemo(() => notes.filter((n) => filter === "ALL" || n.kind === filter), [notes, filter]);

  async function togglePin(n: NoteRow) {
    const res = await api(`/api/notes/${n.id}`, "PATCH", { pinned: !n.pinned });
    if (!res.ok) return toast.error(res.error);
    router.refresh();
  }

  async function remove(n: NoteRow) {
    const ok = await confirm(`¿Borrar la nota «${n.title}»?`, { confirmLabel: "Borrar", danger: true });
    if (!ok) return;
    const res = await api(`/api/notes/${n.id}`, "DELETE");
    if (!res.ok) return toast.error(res.error);
    toast.success("Nota borrada");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["ALL", ...KINDS] as const).map((k) => (
          <button key={k} onClick={() => setFilter(k)} className={cn("btn-ghost btn-sm", filter === k && "border-rust bg-card-2 text-rust")}>
            {k === "ALL" ? "Todas" : NOTE_KIND_META[k].label}
          </button>
        ))}
        <button className="btn-primary btn-sm ml-auto" onClick={() => setEditing("new")}>
          <PlusIcon size={14} /> Nueva nota
        </button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="Todavía no hay notas"
          hint="Guardá acá el brief del cliente, las actas de reuniones y los acuerdos. Todo el equipo las ve y las puede editar."
          action={<button className="btn-primary btn-sm" onClick={() => setEditing("new")}>Crear la primera nota</button>}
        />
      ) : (
        <ul className="space-y-4">
          {visible.map((n) => {
            const canDelete = n.author?.id === currentUserId || isLead;
            const actionable = extractActionItems(n.body).length;
            return (
              <li key={n.id} className="border border-line bg-card rounded-lg">
                <header className="flex flex-wrap items-center gap-2 border-b border-line-strong bg-card-2 px-4 py-2.5">
                  {n.pinned && <span className="lozenge text-ink-faint" title="Fijada">Fijada</span>}
                  <h2 className="font-display text-base font-extrabold text-ink">{n.title}</h2>
                  <span className="lozenge text-ink-soft">{isNoteKind(n.kind) ? NOTE_KIND_META[n.kind].label : n.kind}</span>
                  <span className="ml-auto flex items-center gap-2 text-xs text-ink-faint">
                    <Avatar name={n.author?.name} size={20} />
                    {n.author?.name ?? "Usuario eliminado"} · {timeAgo(n.updatedAt)}
                  </span>
                </header>
                <div className="px-4 py-3">
                  {n.body ? <p className="whitespace-pre-wrap break-words text-sm text-ink-soft">{n.body}</p> : <p className="text-sm text-ink-faint">Sin contenido.</p>}
                </div>
                <footer className="flex flex-wrap gap-2 border-t border-line-strong px-4 py-2">
                  <button className="btn-ghost btn-sm" onClick={() => setEditing(n)}>Editar</button>
                  <button className="btn-ghost btn-sm" onClick={() => togglePin(n)}>{n.pinned ? "Desfijar" : "Fijar"}</button>
                  {actionable > 0 && (
                    <button className="btn-ghost btn-sm" onClick={() => setConverting(n)}>Convertir en tickets ({actionable})</button>
                  )}
                  {canDelete && <button className="btn-ghost btn-sm ml-auto text-danger" onClick={() => remove(n)}>Borrar</button>}
                </footer>
              </li>
            );
          })}
        </ul>
      )}

      {editing && <NoteModal projectId={projectId} note={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {converting && <ConvertModal note={converting} onClose={() => setConverting(null)} />}
    </div>
  );
}

function NoteModal({ projectId, note, onClose }: { projectId: string; note: NoteRow | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [kind, setKind] = useState<NoteKind>(note && isNoteKind(note.kind) ? note.kind : "GENERAL");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = note
      ? await api(`/api/notes/${note.id}`, "PATCH", { title, body, kind })
      : await api(`/api/projects/${projectId}/notes`, "POST", { title, body, kind });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(note ? "Nota guardada" : "Nota creada");
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={note ? "Editar nota" : "Nueva nota"}
      width="max-w-2xl"
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" form="note-form" className="btn-primary" disabled={saving || !title.trim()}>{saving ? "Guardando…" : "Guardar"}</button>
        </>
      }
    >
      <form id="note-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Título</label>
            <input data-autofocus className="field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Tipo</label>
            <select className="field" value={kind} onChange={(e) => setKind(e.target.value as NoteKind)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>{NOTE_KIND_META[k].label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Contenido</label>
          <textarea className="field" rows={12} value={body} onChange={(e) => setBody(e.target.value)} placeholder={"Escribí libre.\nLos puntos que empiecen con “- ” o “- [ ] ” se pueden convertir en tickets."} />
        </div>
      </form>
    </Modal>
  );
}

function ConvertModal({ note, onClose }: { note: NoteRow; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const items = useMemo(() => extractActionItems(note.body), [note.body]);
  const [picked, setPicked] = useState<Set<string>>(new Set(items));
  const [busy, setBusy] = useState(false);

  function toggle(item: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    const res = await api<{ keys: string[] }>(`/api/notes/${note.id}/tickets`, "POST", { items: items.filter((i) => picked.has(i)) });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`${res.data.keys.length} tickets creados en el backlog: ${res.data.keys.join(", ")}`);
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Convertir en tickets"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={busy || picked.size === 0} onClick={submit}>{busy ? "Creando…" : `Crear ${picked.size} en el backlog`}</button>
        </>
      }
    >
      <p className="mb-3 text-sm text-ink-soft">Se crean como tareas en el backlog. Después se priorizan y se les completa la Definition of Ready.</p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item}>
            <label className="flex cursor-pointer items-start gap-2 border border-line-strong px-2.5 py-1.5 text-sm text-ink hover:border-moss rounded-md">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-moss" checked={picked.has(item)} onChange={() => toggle(item)} />
              <span className="min-w-0 flex-1 break-words">{item}</span>
            </label>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
