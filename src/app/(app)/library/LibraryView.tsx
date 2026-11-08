"use client";

import { useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import { api } from "@/lib/client";
import { formatBytes, timeAgo, cn } from "@/lib/ui";
import { CARD_CATEGORIES, categoryLabel, MAX_CARD_ITEMS } from "@/lib/scrum/library";
import { MAX_RESOURCE_BYTES } from "@/lib/scrum/resources";
import type { CardDTO, CardItemDTO } from "@/lib/libraryData";

type Project = { id: string; name: string; key: string | null };

export default function LibraryView({ initial, projects, currentUserId, isLead }: { initial: CardDTO[]; projects: Project[]; currentUserId: string; isLead: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [cards, setCards] = useState(initial);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [tag, setTag] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [editing, setEditing] = useState<CardDTO | "new" | null>(null);
  const [preview, setPreview] = useState<{ title: string; src: string; open: string; image: boolean } | null>(null);

  const allTags = useMemo(() => [...new Set(cards.flatMap((c) => c.tags))].sort((a, b) => a.localeCompare(b)), [cards]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return cards.filter((c) => {
      if (category && c.category !== category) return false;
      if (tag && !c.tags.includes(tag)) return false;
      if (projectFilter === "none" ? c.project : projectFilter && c.project?.id !== projectFilter) return false;
      return !t || `${c.title} ${c.description} ${c.tags.join(" ")} ${c.items.map((i) => `${i.title} ${i.filename ?? ""}`).join(" ")}`.toLowerCase().includes(t);
    });
  }, [cards, q, category, tag, projectFilter]);

  const replace = (card: CardDTO) => setCards((prev) => (prev.some((c) => c.id === card.id) ? prev.map((c) => (c.id === card.id ? card : c)) : [card, ...prev]));

  async function removeCard(c: CardDTO) {
    if (!(await confirm(`¿Borrar la tarjeta "${c.title}" y sus ${c.items.length} archivos y enlaces?`, { confirmLabel: "Borrar", danger: true }))) return;
    const res = await api(`/api/library/cards/${c.id}`, "DELETE");
    if (!res.ok) return toast.error(res.error);
    setCards((prev) => prev.filter((x) => x.id !== c.id));
  }

  async function removeItem(c: CardDTO, i: CardItemDTO) {
    const res = await api<CardDTO>(`/api/library/items/${i.id}`, "DELETE");
    if (!res.ok) return toast.error(res.error);
    replace(res.data);
  }

  // Sube varios archivos a una tarjeta en una sola petición.
  async function addFiles(c: CardDTO, files: File[]) {
    if (files.length === 0) return;
    const big = files.find((f) => f.size > MAX_RESOURCE_BYTES);
    if (big) return toast.error(`"${big.name}" supera el máximo de ${MAX_RESOURCE_BYTES / (1024 * 1024)} MB`);
    const form = new FormData();
    files.forEach((f) => form.append("file", f));
    const r = await fetch(`/api/library/cards/${c.id}/items`, { method: "POST", body: form }).catch(() => null);
    const json = await r?.json().catch(() => null);
    if (!r?.ok) return toast.error(json?.error ?? "No se pudieron subir los archivos");
    replace(json);
    toast.success(files.length === 1 ? "Archivo agregado" : `${files.length} archivos agregados`);
  }

  async function addLink(c: CardDTO) {
    const url = window.prompt("Pega el enlace (Drive, Figma…)");
    if (!url?.trim()) return;
    const res = await api<CardDTO>(`/api/library/cards/${c.id}/items`, "POST", { url });
    if (!res.ok) return toast.error(res.error);
    replace(res.data);
  }

  function open(i: CardItemDTO) {
    const src = i.kind === "LINK" ? i.preview : i.mimeType && /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/.test(i.mimeType) ? `/api/library/items/${i.id}/file` : null;
    if (!src) return;
    setPreview({ title: i.title, src, open: i.kind === "LINK" ? i.url! : `/api/library/items/${i.id}/file`, image: i.kind === "FILE" && !!i.mimeType?.startsWith("image/") });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input className="field-sm w-full sm:w-64" placeholder="Buscar tarjeta, archivo o etiqueta…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        <select className="field-sm" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {CARD_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select className="field-sm" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} aria-label="Proyecto">
          <option value="">Todos los proyectos</option>
          <option value="none">Sin proyecto</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {allTags.length > 0 && (
          <select className="field-sm" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Etiqueta">
            <option value="">Todas las etiquetas</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <button className="btn-primary btn-sm ml-auto" onClick={() => setEditing("new")}>+ Nueva tarjeta</button>
      </div>

      {editing && (
        <CardForm
          key={editing === "new" ? "new" : editing.id}
          card={editing === "new" ? null : editing}
          projects={projects}
          knownTags={allTags}
          onClose={() => setEditing(null)}
          onSaved={(c) => { replace(c); setEditing(null); }}
        />
      )}

      {preview && <PreviewModal p={preview} onClose={() => setPreview(null)} />}

      {cards.length === 0 ? (
        <EmptyState title="Todavía no hay tarjetas" hint="Crea una tarjeta, por ejemplo «Resolución de la reunión del lunes», y sube dentro varios archivos y enlaces." />
      ) : shown.length === 0 ? (
        <p className="text-sm text-ink-faint">Nada coincide con los filtros.</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {shown.map((c) => (
            <CardView key={c.id} c={c} mine={c.createdBy?.id === currentUserId || isLead} currentUserId={currentUserId} isLead={isLead} onEdit={() => setEditing(c)} onDelete={() => removeCard(c)} onAddFiles={(f) => addFiles(c, f)} onAddLink={() => addLink(c)} onRemoveItem={(i) => removeItem(c, i)} onOpen={open} onTag={setTag} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CardView({ c, mine, currentUserId, isLead, onEdit, onDelete, onAddFiles, onAddLink, onRemoveItem, onOpen, onTag }: { c: CardDTO; mine: boolean; currentUserId: string; isLead: boolean; onEdit: () => void; onDelete: () => void; onAddFiles: (f: File[]) => void; onAddLink: () => void; onRemoveItem: (i: CardItemDTO) => void; onOpen: (i: CardItemDTO) => void; onTag: (t: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const canPreview = (i: CardItemDTO) => (i.kind === "LINK" ? !!i.preview : !!i.mimeType && /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/.test(i.mimeType));
  return (
    <li
      className={cn("flex flex-col rounded-lg border bg-card p-4 transition-colors", drag ? "border-rust bg-chip-tint" : "border-line")}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); onAddFiles(Array.from(e.dataTransfer.files)); }}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <span className="lozenge text-rust">{categoryLabel(c.category)}</span>
          <h3 className="mt-1 font-display text-base font-extrabold leading-tight text-ink">{c.title}</h3>
          <p className="text-xs text-ink-faint">
            {c.createdBy?.name ?? "Alguien"} · {timeAgo(c.updatedAt)}
            {c.project ? <> · <a className="font-semibold text-rust hover:underline" href={`/projects/${c.project.id}/files`}>{c.project.name}</a></> : null}
          </p>
        </div>
        {mine && (
          <div className="flex shrink-0 gap-3 text-xs">
            <button className="text-ink-soft hover:text-ink" onClick={onEdit}>Editar</button>
            <button className="text-ink-faint hover:text-danger" onClick={onDelete}>Borrar</button>
          </div>
        )}
      </div>
      {c.description && <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{c.description}</p>}
      {c.tags.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-1">{c.tags.map((t) => <button key={t} onClick={() => onTag(t)} className="lozenge text-ink-soft hover:text-rust">{t}</button>)}</p>
      )}
      <ul className="mt-3 flex-1 space-y-1.5">
        {c.items.length === 0 && <li className="rounded-md border border-dashed border-line-strong px-3 py-3 text-center text-xs text-ink-faint">Vacía. Arrastra archivos aquí o usa «+ Archivos».</li>}
        {c.items.map((i) => (
          <li key={i.id} className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-sm">
            <span className={cn("shrink-0 rounded border px-1 text-[10px] font-bold uppercase", i.kind === "LINK" ? "border-blue text-blue" : "border-moss text-moss-ink")}>{i.kind === "LINK" ? i.service ?? "Enlace" : (i.filename?.split(".").pop() ?? "arch").slice(0, 5)}</span>
            <a href={i.kind === "LINK" ? i.url! : `/api/library/items/${i.id}/file`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-medium text-ink hover:text-rust hover:underline" title={i.title}>{i.title}</a>
            {i.kind === "FILE" && i.size != null && <span className="shrink-0 text-[11px] text-ink-faint">{formatBytes(i.size)}</span>}
            {canPreview(i) && <button className="shrink-0 text-xs text-ink-soft hover:text-ink" onClick={() => onOpen(i)}>Ver</button>}
            {mine && <button className="shrink-0 text-xs text-ink-faint hover:text-danger" onClick={() => onRemoveItem(i)} aria-label={`Quitar ${i.title}`}>quitar</button>}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-2">
        <input ref={input} type="file" multiple className="hidden" onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; onAddFiles(fs); }} />
        <button className="btn-ghost btn-sm" disabled={c.items.length >= MAX_CARD_ITEMS} onClick={() => input.current?.click()}>+ Archivos</button>
        <button className="btn-ghost btn-sm" disabled={c.items.length >= MAX_CARD_ITEMS} onClick={onAddLink}>+ Enlace</button>
        <span className="ml-auto text-[11px] text-ink-faint">{c.items.length}/{MAX_CARD_ITEMS}</span>
      </div>
    </li>
  );
}

function CardForm({ card, projects, knownTags, onClose, onSaved }: { card: CardDTO | null; projects: Project[]; knownTags: string[]; onClose: () => void; onSaved: (c: CardDTO) => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(card?.title ?? "");
  const [description, setDescription] = useState(card?.description ?? "");
  const [category, setCategory] = useState(card?.category ?? "OTRO");
  const [tags, setTags] = useState((card?.tags ?? []).join(", "));
  const [projectId, setProjectId] = useState(card?.project?.id ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const body = { title, description, category, tags: tags.split(","), projectId: projectId || null };
    const res = card ? await api<CardDTO>(`/api/library/cards/${card.id}`, "PATCH", body) : await api<CardDTO>("/api/library/cards", "POST", body);
    if (!res.ok) { setBusy(false); return toast.error(res.error); }
    let saved = res.data;
    // Archivos elegidos al crear: todos juntos en una sola subida.
    if (!card && files.length > 0) {
      const form = new FormData();
      files.forEach((f) => form.append("file", f));
      const r = await fetch(`/api/library/cards/${saved.id}/items`, { method: "POST", body: form }).catch(() => null);
      const json = await r?.json().catch(() => null);
      if (r?.ok) saved = json;
      else toast.error(`La tarjeta se creó, pero los archivos no se subieron: ${json?.error ?? "error"}`);
    }
    setBusy(false);
    toast.success(card ? "Tarjeta guardada" : "Tarjeta creada");
    onSaved(saved);
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-line-strong bg-card p-4">
      <h3 className="font-display text-sm font-bold text-ink">{card ? "Editar tarjeta" : "Nueva tarjeta"}</h3>
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Título *</label>
          <input className="field" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Resolución de la reunión del lunes" autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Tipo</label>
          <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CARD_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-ink-soft">Descripción (opcional)</label>
        <textarea className="field" rows={2} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Etiquetas (separadas por comas)</label>
          <input className="field" list="library-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="reunión, cliente, noviembre" />
          <datalist id="library-tags">{knownTags.map((t) => <option key={t} value={t} />)}</datalist>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Proyecto (opcional)</label>
          <select className="field" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Sin proyecto</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      {!card && (
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Archivos (puedes elegir varios)</label>
          <input type="file" multiple className="block w-full text-sm text-ink-soft" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          {files.length > 0 && <p className="mt-1 text-xs text-ink-faint">{files.length} archivo(s): {files.map((f) => f.name).join(", ").slice(0, 160)}</p>}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" disabled={busy || !title.trim()}>{busy ? "Guardando…" : card ? "Guardar" : "Crear tarjeta"}</button>
      </div>
    </form>
  );
}

function PreviewModal({ p, onClose }: { p: { title: string; src: string; open: string; image: boolean }; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={`Vista previa de ${p.title}`} onClick={onClose}>
      <div className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-line-strong bg-surface shadow-hard-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-4 py-2">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{p.title}</p>
          <a href={p.open} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-rust hover:underline">Abrir en otra pestaña</a>
          <button className="text-ink-faint hover:text-ink" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="min-h-0 flex-1 bg-paper-deep">
          {p.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.src} alt={p.title} className="mx-auto h-full w-full object-contain" />
          ) : (
            <iframe src={p.src} title={p.title} className="h-full w-full border-0" sandbox="allow-scripts allow-same-origin allow-popups allow-forms" referrerPolicy="no-referrer" />
          )}
        </div>
      </div>
    </div>
  );
}
