"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import { api } from "@/lib/client";
import { formatBytes, timeAgo, cn } from "@/lib/ui";
import { MAX_RESOURCE_BYTES } from "@/lib/scrum/resources";
import type { ResourceDTO } from "@/lib/resourceData";


// Archivos y enlaces del proyecto, con etiquetas y a qué pertenecen (proyecto, sprint o ticket).
export default function FilesView({ projectId, initial, sprints, tickets, currentUserId, isLead }: { projectId: string; initial: ResourceDTO[]; sprints: Array<{ id: string; name: string }>; tickets: Array<{ id: string; label: string }>; currentUserId: string; isLead: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState(initial);
  const [adding, setAdding] = useState<"file" | "link" | null>(null);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [scope, setScope] = useState(""); // "" todo | "project" | sprint:<id> | task:<id>
  const [editing, setEditing] = useState<ResourceDTO | null>(null);
  const [previewing, setPreviewing] = useState<ResourceDTO | null>(null);

  const allTags = useMemo(() => [...new Set(items.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b)), [items]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter((r) => {
      if (tag && !r.tags.includes(tag)) return false;
      if (scope === "project" && (r.sprint || r.task)) return false;
      if (scope.startsWith("sprint:") && r.sprint?.id !== scope.slice(7)) return false;
      if (scope.startsWith("task:") && r.task?.id !== scope.slice(5)) return false;
      return !t || `${r.title} ${r.filename ?? ""} ${r.url ?? ""} ${r.tags.join(" ")}`.toLowerCase().includes(t);
    });
  }, [items, q, tag, scope]);

  async function reload() {
    const res = await api<ResourceDTO[]>(`/api/projects/${projectId}/resources`);
    if (res.ok) setItems(res.data);
    router.refresh();
  }

  async function remove(r: ResourceDTO) {
    if (!(await confirm(`¿Borrar "${r.title}"?`, { confirmLabel: "Borrar", danger: true }))) return;
    const res = await api(`/api/resources/${r.id}`, "DELETE");
    if (!res.ok) return toast.error(res.error);
    setItems((prev) => prev.filter((x) => x.id !== r.id));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input className="field-sm w-full sm:w-64" placeholder="Buscar archivo, enlace o etiqueta…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        <select className="field-sm" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Pertenece a">
          <option value="">Todo</option>
          <option value="project">Solo del proyecto</option>
          {sprints.map((s) => <option key={s.id} value={`sprint:${s.id}`}>Sprint: {s.name}</option>)}
        </select>
        {allTags.length > 0 && (
          <select className="field-sm" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Etiqueta">
            <option value="">Todas las etiquetas</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <div className="ml-auto flex gap-2">
          <button className="btn-ghost btn-sm" onClick={() => setAdding("link")}>+ Enlace</button>
          <button className="btn-primary btn-sm" onClick={() => setAdding("file")}>+ Archivo</button>
        </div>
      </div>

      {(adding || editing) && (
        <ResourceForm
          key={editing?.id ?? adding}
          mode={editing ? "edit" : adding!}
          projectId={projectId}
          resource={editing}
          sprints={sprints}
          tickets={tickets}
          knownTags={allTags}
          onClose={() => { setAdding(null); setEditing(null); }}
          onSaved={() => { setAdding(null); setEditing(null); void reload(); }}
        />
      )}

      {previewing && <PreviewModal r={previewing} onClose={() => setPreviewing(null)} />}

      {items.length === 0 ? (
        <EmptyState title="Todavía no hay archivos ni enlaces" hint="Sube documentos o pega enlaces (Drive, Figma…), ponles etiquetas e indica si son del proyecto, de un sprint o de un ticket." />
      ) : shown.length === 0 ? (
        <p className="text-sm text-ink-faint">Nada coincide con los filtros.</p>
      ) : (
        <ul className="divide-y divide-line-strong overflow-hidden rounded-lg border border-line bg-card">
          {shown.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <span className={cn("mt-0.5 shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase", r.kind === "LINK" ? "border-blue text-blue" : "border-moss text-moss-ink")}>{r.kind === "LINK" ? r.service ?? "Enlace" : (r.filename?.split(".").pop() ?? "archivo").slice(0, 5)}</span>
              <div className="min-w-0 flex-1">
                {r.kind === "LINK" ? (
                  <a href={r.url!} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink hover:text-rust hover:underline">{r.title}</a>
                ) : (
                  <a href={`/api/resources/${r.id}/file`} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink hover:text-rust hover:underline">{r.title}</a>
                )}
                <p className="text-xs text-ink-faint">
                  {r.kind === "FILE" && r.size != null ? `${formatBytes(r.size)} · ` : ""}
                  {r.uploadedBy?.name ?? "Alguien"} · {timeAgo(r.createdAt)} · {r.task ? `Ticket ${r.task.key}` : r.sprint ? `Sprint ${r.sprint.name}` : "Proyecto"}
                </p>
                {r.tags.length > 0 && (
                  <p className="mt-1 flex flex-wrap gap-1">
                    {r.tags.map((t) => (
                      <button key={t} onClick={() => setTag(t)} className="lozenge text-ink-soft hover:text-rust">{t}</button>
                    ))}
                  </p>
                )}
              </div>
              {previewSrc(r) && <button className="shrink-0 text-xs text-ink-soft hover:text-ink" onClick={() => setPreviewing(r)}>Vista previa</button>}
              {(r.uploadedBy?.id === currentUserId || isLead) && (
                <div className="flex shrink-0 gap-3 text-xs">
                  <button className="text-ink-soft hover:text-ink" onClick={() => { setAdding(null); setEditing(r); }}>Editar</button>
                  <button className="text-ink-faint hover:text-danger" onClick={() => remove(r)}>Borrar</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ResourceForm({ mode, projectId, resource, sprints, tickets, knownTags, onClose, onSaved }: { mode: "file" | "link" | "edit"; projectId: string; resource: ResourceDTO | null; sprints: Array<{ id: string; name: string }>; tickets: Array<{ id: string; label: string }>; knownTags: string[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState(resource?.url ?? "");
  const [title, setTitle] = useState(resource?.title ?? "");
  const [tags, setTags] = useState((resource?.tags ?? []).join(", "));
  const [belongs, setBelongs] = useState(resource?.task ? `task:${resource.task.id}` : resource?.sprint ? `sprint:${resource.sprint.id}` : "project");
  const [busy, setBusy] = useState(false);
  const kind = mode === "edit" ? resource!.kind.toLowerCase() : mode;

  const sprintId = belongs.startsWith("sprint:") ? belongs.slice(7) : null;
  const taskId = belongs.startsWith("task:") ? belongs.slice(5) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    let res;
    if (mode === "edit") {
      res = await api(`/api/resources/${resource!.id}`, "PATCH", { title: title.trim() || undefined, ...(kind === "link" ? { url } : {}), tags: tags.split(","), sprintId, taskId });
    } else if (mode === "file") {
      if (!file) { setBusy(false); return toast.error("Elige un archivo"); }
      if (file.size > MAX_RESOURCE_BYTES) { setBusy(false); return toast.error(`Máximo ${MAX_RESOURCE_BYTES / (1024 * 1024)} MB por archivo`); }
      const form = new FormData();
      form.append("file", file);
      form.append("title", title);
      form.append("tags", tags);
      if (sprintId) form.append("sprintId", sprintId);
      if (taskId) form.append("taskId", taskId);
      const r = await fetch(`/api/projects/${projectId}/resources`, { method: "POST", body: form }).catch(() => null);
      const json = await r?.json().catch(() => null);
      res = r?.ok ? { ok: true as const } : { ok: false as const, error: json?.error ?? "No se pudo subir" };
    } else {
      res = await api(`/api/projects/${projectId}/resources`, "POST", { url, title, tags, sprintId, taskId });
    }
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(mode === "edit" ? "Cambios guardados" : mode === "file" ? "Archivo subido" : "Enlace agregado");
    onSaved();
  }

  const datalistId = "known-tags";
  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-line-strong bg-card p-4">
      <h3 className="font-display text-sm font-bold text-ink">{mode === "edit" ? "Editar" : mode === "file" ? "Subir archivo" : "Agregar enlace"}</h3>
      {mode === "file" && (
        <div>
          <input ref={fileRef} type="file" className="block w-full text-sm text-ink-soft" onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !title) setTitle(f.name); }} />
          <p className="mt-1 text-xs text-ink-faint">Hasta {MAX_RESOURCE_BYTES / (1024 * 1024)} MB. Para archivos grandes, súbelos a Drive y agrega el enlace.</p>
        </div>
      )}
      {kind === "link" && (
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Enlace</label>
          <input className="field" required placeholder="https://drive.google.com/…" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
      )}
      <div>
        <label className="mb-1 block text-xs font-semibold text-ink-soft">Nombre {kind === "link" ? "(opcional)" : ""}</label>
        <input className="field" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "link" ? "Ej: Brief del cliente" : ""} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Etiquetas (separadas por comas)</label>
          <input className="field" list={datalistId} placeholder="brief, contrato, diseño" value={tags} onChange={(e) => setTags(e.target.value)} />
          <datalist id={datalistId}>{knownTags.map((t) => <option key={t} value={t} />)}</datalist>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Pertenece a</label>
          <select className="field" value={belongs} onChange={(e) => setBelongs(e.target.value)}>
            <option value="project">Todo el proyecto</option>
            {sprints.length > 0 && <optgroup label="Sprint">{sprints.map((s) => <option key={s.id} value={`sprint:${s.id}`}>{s.name}</option>)}</optgroup>}
            {tickets.length > 0 && <optgroup label="Ticket">{tickets.map((t) => <option key={t.id} value={`task:${t.id}`}>{t.label}</option>)}</optgroup>}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" disabled={busy}>{busy ? "Guardando…" : mode === "edit" ? "Guardar" : mode === "file" ? "Subir" : "Agregar"}</button>
      </div>
    </form>
  );
}


// Dirección que se puede mostrar dentro de la app: enlaces de Drive/Docs/Figma, imágenes y PDF.
function previewSrc(r: ResourceDTO): string | null {
  if (r.kind === "LINK") return r.preview;
  return r.mimeType && /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/.test(r.mimeType) ? `/api/resources/${r.id}/file` : null;
}

function PreviewModal({ r, onClose }: { r: ResourceDTO; onClose: () => void }) {
  const src = previewSrc(r)!;
  const isImage = r.kind === "FILE" && !!r.mimeType?.startsWith("image/");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={`Vista previa de ${r.title}`} onClick={onClose}>
      <div className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-line-strong bg-surface shadow-hard-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-4 py-2">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{r.title}</p>
          <a href={r.kind === "LINK" ? r.url! : `/api/resources/${r.id}/file`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-rust hover:underline">Abrir en otra pestaña</a>
          <button className="text-ink-faint hover:text-ink" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="min-h-0 flex-1 bg-paper-deep">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={r.title} className="mx-auto h-full w-full object-contain" />
          ) : (
            <iframe src={src} title={r.title} className="h-full w-full border-0" sandbox="allow-scripts allow-same-origin allow-popups allow-forms" referrerPolicy="no-referrer" />
          )}
        </div>
        {r.kind === "LINK" && <p className="border-t border-line px-4 py-1.5 text-[11px] text-ink-faint">Si no se ve, el documento no está compartido con tu cuenta o no permite vista previa: usa «Abrir en otra pestaña».</p>}
      </div>
    </div>
  );
}
