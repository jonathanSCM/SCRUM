"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import { api } from "@/lib/client";
import { formatBytes, timeAgo, cn } from "@/lib/ui";
import { CARD_CATEGORIES, categoryLabel, MAX_CARD_ITEMS } from "@/lib/scrum/library";
import { MAX_RESOURCE_BYTES } from "@/lib/scrum/resources";
import type { CardDTO, CardItemDTO } from "@/lib/libraryData";

type Project = { id: string; name: string; key: string | null };

const canPreview = (i: CardItemDTO) => (i.kind === "LINK" ? !!i.preview : !!i.mimeType && /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/.test(i.mimeType));
const countText = (c: CardDTO) => {
  const files = c.items.filter((i) => i.kind === "FILE").length;
  const links = c.items.length - files;
  if (c.items.length === 0) return "Vacía";
  return [files ? `${files} ${files === 1 ? "archivo" : "archivos"}` : "", links ? `${links} ${links === 1 ? "enlace" : "enlaces"}` : ""].filter(Boolean).join(" · ");
};

export default function LibraryView({ initial, projects, currentUserId, isLead, openCardId }: { initial: CardDTO[]; projects: Project[]; currentUserId: string; isLead: boolean; openCardId?: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [cards, setCards] = useState(initial);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [tag, setTag] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [editing, setEditing] = useState<CardDTO | "new" | null>(null);
  const [openId, setOpenId] = useState<string | null>(openCardId ?? null);

  const allTags = useMemo(() => [...new Set(cards.flatMap((c) => c.tags))].sort((a, b) => a.localeCompare(b)), [cards]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return cards.filter((c) => {
      if (category && (c.auto || c.category !== category)) return false;
      if (tag && !c.tags.includes(tag)) return false;
      if (projectFilter === "none" ? c.project : projectFilter && c.project?.id !== projectFilter) return false;
      return !t || `${c.title} ${c.description} ${c.tags.join(" ")} ${c.items.map((i) => `${i.title} ${i.note} ${i.filename ?? ""}`).join(" ")}`.toLowerCase().includes(t);
    });
  }, [cards, q, category, tag, projectFilter]);

  const open = openId ? cards.find((c) => c.id === openId) ?? null : null;
  const replace = (card: CardDTO) => setCards((prev) => (prev.some((c) => c.id === card.id) ? prev.map((c) => (c.id === card.id ? card : c)) : [card, ...prev]));

  async function reloadAll() {
    const res = await api<CardDTO[]>("/api/library/cards");
    if (res.ok) setCards(res.data);
  }

  async function removeCard(c: CardDTO) {
    if (!(await confirm(`¿Borrar la tarjeta "${c.title}" y sus ${c.items.length} archivos y enlaces?`, { confirmLabel: "Borrar", danger: true }))) return;
    const res = await api(`/api/library/cards/${c.id}`, "DELETE");
    if (!res.ok) return toast.error(res.error);
    setCards((prev) => prev.filter((x) => x.id !== c.id));
    setOpenId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input className="field-sm w-full sm:w-64" placeholder="Buscar tarjeta, archivo, nota o etiqueta…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
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

      {cards.length === 0 ? (
        <EmptyState title="Todavía no hay tarjetas" hint="Crea una tarjeta, por ejemplo «Resolución de la reunión del lunes», y ve agregando archivos y enlaces con el tiempo. Lo que subas en la pestaña Archivos de un proyecto aparece aquí solo." />
      ) : shown.length === 0 ? (
        <p className="text-sm text-ink-faint">Nada coincide con los filtros.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => (
            <li key={c.id}>
              <button onClick={() => setOpenId(c.id)} className="lift flex h-full w-full flex-col rounded-lg border border-line bg-card p-4 text-left hover:border-rust">
                <span className={cn("lozenge self-start", c.auto ? "text-moss-ink" : "text-rust")}>{c.auto ? "Proyecto" : categoryLabel(c.category)}</span>
                <span className="mt-1 font-display text-base font-extrabold leading-tight text-ink">{c.title}</span>
                {c.description && <span className="mt-1 line-clamp-2 text-xs text-ink-soft">{c.description}</span>}
                {c.tags.length > 0 && <span className="mt-2 flex flex-wrap gap-1">{c.tags.slice(0, 4).map((t) => <span key={t} className="lozenge text-ink-soft">{t}</span>)}</span>}
                <span className="mt-auto flex items-center justify-between gap-2 pt-3 text-xs">
                  <span className="font-semibold text-ink">{countText(c)}</span>
                  <span className="text-ink-faint">{timeAgo(c.updatedAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <CardPanel
          key={open.id}
          c={open}
          mine={!open.auto && (open.createdBy?.id === currentUserId || isLead)}
          onClose={() => setOpenId(null)}
          onEdit={() => { setOpenId(null); setEditing(open); }}
          onDelete={() => removeCard(open)}
          onChanged={(card) => replace(card)}
          onReload={reloadAll}
        />
      )}
    </div>
  );
}

// Panel lateral con todo lo que tiene una tarjeta: archivos, enlaces y su nota. Se abre al pulsar la tarjeta.
function CardPanel({ c, mine, onClose, onEdit, onDelete, onChanged, onReload }: { c: CardDTO; mine: boolean; onClose: () => void; onEdit: () => void; onDelete: () => void; onChanged: (c: CardDTO) => void; onReload: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [note, setNote] = useState("");
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [preview, setPreview] = useState<CardItemDTO | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !preview && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, preview]);

  const projectId = c.auto ? c.project?.id : null;
  const full = c.items.length >= MAX_CARD_ITEMS && !c.auto;

  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    const big = files.find((f) => f.size > MAX_RESOURCE_BYTES);
    if (big) return toast.error(`"${big.name}" supera el máximo de ${MAX_RESOURCE_BYTES / (1024 * 1024)} MB`);
    setBusy(true);
    if (projectId) {
      // Tarjeta de proyecto: los archivos van a la pestaña Archivos del proyecto.
      let ok = 0;
      for (const f of files) {
        const form = new FormData();
        form.append("file", f);
        const r = await fetch(`/api/projects/${projectId}/resources`, { method: "POST", body: form }).catch(() => null);
        if (r?.ok) ok++;
        else toast.error(`${f.name}: ${(await r?.json().catch(() => null))?.error ?? "no se pudo subir"}`);
      }
      setBusy(false);
      if (ok) toast.success(ok === 1 ? "Archivo agregado al proyecto" : `${ok} archivos agregados al proyecto`);
      return onReload();
    }
    const form = new FormData();
    files.forEach((f) => form.append("file", f));
    if (note.trim()) form.append("note", note.trim());
    const r = await fetch(`/api/library/cards/${c.id}/items`, { method: "POST", body: form }).catch(() => null);
    const json = await r?.json().catch(() => null);
    setBusy(false);
    if (!r?.ok) return toast.error(json?.error ?? "No se pudieron subir los archivos");
    onChanged(json);
    setNote("");
    toast.success(files.length === 1 ? "Archivo agregado" : `${files.length} archivos agregados`);
  }

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = projectId
      ? await api(`/api/projects/${projectId}/resources`, "POST", { url: linkUrl, title: linkTitle || undefined })
      : await api<CardDTO>(`/api/library/cards/${c.id}/items`, "POST", { url: linkUrl, title: linkTitle || undefined, note: note.trim() || undefined });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setLinkUrl("");
    setLinkTitle("");
    setLinkOpen(false);
    setNote("");
    if (projectId) onReload();
    else onChanged(res.data as CardDTO);
  }

  async function saveItem(i: CardItemDTO) {
    const res = await api<CardDTO>(`/api/library/items/${i.id}`, "PATCH", { title: draftTitle.trim() || i.title, note: draftNote });
    if (!res.ok) return toast.error(res.error);
    setEditingItem(null);
    onChanged(res.data);
  }

  async function removeItem(i: CardItemDTO) {
    if (!(await confirm(`¿Quitar "${i.title}"?`, { confirmLabel: "Quitar", danger: true }))) return;
    const res = projectId ? await api(`/api/resources/${i.id}`, "DELETE") : await api<CardDTO>(`/api/library/items/${i.id}`, "DELETE");
    if (!res.ok) return toast.error(res.error);
    if (projectId) onReload();
    else onChanged(res.data as CardDTO);
  }

  const href = (i: CardItemDTO) => (i.kind === "LINK" ? i.url! : i.fileUrl!);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label={c.title} onClick={onClose}>
      <div
        className={cn("flex h-full w-full max-w-lg flex-col border-l border-line-strong bg-surface shadow-hard-lg", drag && "ring-2 ring-rust")}
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void addFiles(Array.from(e.dataTransfer.files)); }}
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <span className={cn("lozenge", c.auto ? "text-moss-ink" : "text-rust")}>{c.auto ? "Proyecto" : categoryLabel(c.category)}</span>
            <h2 className="mt-1 font-display text-lg font-extrabold leading-tight text-ink">{c.title}</h2>
            <p className="text-xs text-ink-faint">
              {countText(c)} · actualizada {timeAgo(c.updatedAt)}
              {c.createdBy ? ` · creada por ${c.createdBy.name}` : ""}
              {c.project && !c.auto ? <> · <a className="font-semibold text-rust hover:underline" href={`/projects/${c.project.id}/files`}>{c.project.name}</a></> : null}
            </p>
          </div>
          <button className="text-ink-faint hover:text-ink" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {c.description && <p className="whitespace-pre-wrap text-sm text-ink-soft">{c.description}</p>}
          {c.tags.length > 0 && <p className="flex flex-wrap gap-1">{c.tags.map((t) => <span key={t} className="lozenge text-ink-soft">{t}</span>)}</p>}
          {c.auto && c.project && (
            <p className="rounded-md border border-line bg-paper-deep px-3 py-2 text-xs text-ink-soft">
              Esta tarjeta junta lo que se sube a <b>{c.project.name}</b>. Para ponerle etiquetas, ligarlo a un sprint o a un ticket, usa la pestaña <a className="font-semibold text-rust hover:underline" href={`/projects/${c.project.id}/files`}>Archivos del proyecto</a>.
            </p>
          )}

          {c.items.length === 0 && <p className="rounded-md border border-dashed border-line-strong px-3 py-4 text-center text-xs text-ink-faint">Vacía. Arrastra archivos aquí o usa «+ Archivos».</p>}
          <ul className="space-y-2">
            {[...c.items].reverse().map((i) => {
              return (
                <li key={i.id} className="rounded-md border border-line p-3">
                  {editingItem === i.id ? (
                    <div className="space-y-2">
                      <input className="field" value={draftTitle} maxLength={200} onChange={(e) => setDraftTitle(e.target.value)} aria-label="Título" />
                      <textarea className="field" rows={2} maxLength={1000} placeholder="Nota (ej. versión firmada, falta la página 3…)" value={draftNote} onChange={(e) => setDraftNote(e.target.value)} />
                      <div className="flex gap-2">
                        <button className="btn-primary btn-sm" onClick={() => saveItem(i)}>Guardar</button>
                        <button className="btn-ghost btn-sm" onClick={() => setEditingItem(null)}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <span className={cn("mt-0.5 shrink-0 rounded border px-1 text-[10px] font-bold uppercase", i.kind === "LINK" ? "border-blue text-blue" : "border-moss text-moss-ink")}>{i.kind === "LINK" ? i.service ?? "Enlace" : (i.filename?.split(".").pop() ?? "arch").slice(0, 5)}</span>
                      <div className="min-w-0 flex-1">
                        <a href={href(i)} target="_blank" rel="noopener noreferrer" className="break-words text-sm font-semibold text-ink hover:text-rust hover:underline">{i.title}</a>
                        {i.note && <p className="mt-0.5 whitespace-pre-wrap text-xs italic text-ink-soft">{i.note}</p>}
                        <p className="mt-0.5 text-[11px] text-ink-faint">
                          {i.kind === "FILE" && i.size != null ? `${formatBytes(i.size)} · ` : ""}
                          {i.uploadedBy ? `${i.uploadedBy} · ` : ""}{timeAgo(i.createdAt)}
                        </p>
                        <p className="mt-1 flex flex-wrap gap-3 text-xs">
                          {canPreview(i) && <button className="text-ink-soft hover:text-ink" onClick={() => setPreview(i)}>Ver</button>}
                          {!c.auto && mine && <button className="text-ink-soft hover:text-ink" onClick={() => { setEditingItem(i.id); setDraftTitle(i.title); setDraftNote(i.note); }}>Título y nota</button>}
                          {(mine || c.auto) && <button className="text-ink-faint hover:text-danger" onClick={() => removeItem(i)}>Quitar</button>}
                        </p>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-2 border-t border-line bg-card px-5 py-3">
          {!c.auto && <input className="field-sm w-full" placeholder="Nota para lo que subas (opcional)" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Nota" />}
          {linkOpen ? (
            <form onSubmit={addLink} className="space-y-2">
              <input className="field" required placeholder="https://drive.google.com/…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} autoFocus />
              <input className="field" placeholder="Nombre (opcional)" maxLength={200} value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} />
              <div className="flex gap-2">
                <button className="btn-primary btn-sm" disabled={busy}>Agregar enlace</button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setLinkOpen(false)}>Cancelar</button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input ref={input} type="file" multiple className="hidden" onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; void addFiles(fs); }} />
              <button className="btn-primary btn-sm" disabled={busy || full} onClick={() => input.current?.click()}>{busy ? "Subiendo…" : "+ Archivos"}</button>
              <button className="btn-ghost btn-sm" disabled={busy || full} onClick={() => setLinkOpen(true)}>+ Enlace</button>
              {!c.auto && <span className="text-[11px] text-ink-faint">{c.items.length}/{MAX_CARD_ITEMS}</span>}
              {mine && (
                <span className="ml-auto flex gap-3 text-xs">
                  <button className="text-ink-soft hover:text-ink" onClick={onEdit}>Editar tarjeta</button>
                  <button className="text-ink-faint hover:text-danger" onClick={onDelete}>Borrar</button>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={`Vista previa de ${preview.title}`} onClick={(e) => { e.stopPropagation(); setPreview(null); }}>
          <div className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-line-strong bg-surface shadow-hard-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-line px-4 py-2">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{preview.title}</p>
              <a href={href(preview)} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-rust hover:underline">Abrir en otra pestaña</a>
              <button className="text-ink-faint hover:text-ink" onClick={() => setPreview(null)} aria-label="Cerrar">✕</button>
            </div>
            <div className="min-h-0 flex-1 bg-paper-deep">
              {preview.kind === "FILE" && preview.mimeType?.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.fileUrl!} alt={preview.title} className="mx-auto h-full w-full object-contain" />
              ) : (
                <iframe src={preview.kind === "LINK" ? preview.preview! : preview.fileUrl!} title={preview.title} className="h-full w-full border-0" sandbox="allow-scripts allow-same-origin allow-popups allow-forms" referrerPolicy="no-referrer" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
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
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Archivos (opcional; puedes seguir agregando después)</label>
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
