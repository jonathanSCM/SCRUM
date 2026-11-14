"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { cn } from "@/lib/ui";
import { useToast } from "@/components/ui/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";
import { PaperclipIcon } from "@/components/ui/Icons";

type FileRow = { id: string; kind: "FILE" | "LINK"; url: string | null; filename: string; mimeType: string; size: number; createdAt: string; uploadedBy: { id: string; name: string } | null; canDelete: boolean };

const size = (b: number) => (b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const MAX_MB = 20;

// Archivos de la reunión (acta, presentación, lo que se trató…): se suben, se ven o descargan y se borran.
export default function MeetingFiles({ meetingId }: { meetingId: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [hidden, setHidden] = useState(0);
  const [busy, setBusy] = useState(0);
  const [drag, setDrag] = useState(false);
  const [adding, setAdding] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");

  const load = useCallback(async () => {
    const res = await api<{ files: FileRow[]; hidden: number }>(`/api/meetings/${meetingId}/files`);
    if (res.ok) {
      setFiles(res.data.files);
      setHidden(res.data.hidden);
    }
  }, [meetingId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function upload(list: File[]) {
    for (const f of list) {
      if (f.size > MAX_MB * 1024 * 1024) {
        toast.error(`«${f.name}» supera los ${MAX_MB} MB`);
        continue;
      }
      setBusy((n) => n + 1);
      const form = new FormData();
      form.append("file", f);
      try {
        const res = await fetch(`/api/meetings/${meetingId}/files`, { method: "POST", body: form });
        if (!res.ok) toast.error((await res.json().catch(() => null))?.error || `No se pudo subir «${f.name}»`);
      } catch {
        toast.error(`No se pudo subir «${f.name}»`);
      }
      setBusy((n) => n - 1);
    }
    void load();
  }

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    const url = /^https?:\/\//i.test(linkUrl.trim()) ? linkUrl.trim() : `https://${linkUrl.trim()}`;
    setBusy((n) => n + 1);
    const res = await api(`/api/meetings/${meetingId}/files`, "POST", { url, title: linkTitle.trim() || undefined });
    setBusy((n) => n - 1);
    if (!res.ok) return toast.error(res.error);
    setLinkUrl("");
    setLinkTitle("");
    setAdding(false);
    void load();
  }

  async function remove(f: FileRow) {
    if (!(await confirm(`¿Borrar «${f.filename}»?`, { confirmLabel: "Borrar", danger: true }))) return;
    const res = await api(`/api/meetings/${meetingId}/files/${f.id}`, "DELETE");
    if (!res.ok) return toast.error(res.error);
    void load();
  }

  if (!files) return null;
  const previewable = (f: FileRow) => /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/.test(f.mimeType);
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-faint">Archivos de la reunión</h3>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void upload(Array.from(e.dataTransfer.files)); }}
        className={cn("rounded-lg border border-dashed p-3 transition-colors", drag ? "border-rust bg-chip-tint" : "border-line-strong")}
      >
        {files.length > 0 && (
          <ul className="mb-2 divide-y divide-line">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-2 py-1.5 text-sm">
                {f.kind === "LINK" ? <span aria-hidden className="text-ink-soft">🔗</span> : <PaperclipIcon size={14} />}
                {f.kind === "LINK" ? (
                  <a href={f.url ?? "#"} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-semibold text-ink hover:text-rust" title={f.url ?? f.filename}>{f.filename}</a>
                ) : (
                  <a href={`/api/meetings/${meetingId}/files/${f.id}`} target={previewable(f) ? "_blank" : undefined} rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-semibold text-ink hover:text-rust" title={f.filename}>{f.filename}</a>
                )}
                <span className="shrink-0 text-[11px] text-ink-faint">{f.kind === "LINK" ? "enlace" : size(f.size)}{f.uploadedBy ? ` · ${f.uploadedBy.name.split(" ")[0]}` : ""}</span>
                {f.kind !== "LINK" && <a href={`/api/meetings/${meetingId}/files/${f.id}?download=1`} className="shrink-0 px-1 text-xs text-ink-soft hover:text-rust" aria-label={`Descargar ${f.filename}`} title="Descargar">↓</a>}
                {f.canDelete && <button className="shrink-0 px-1 text-xs text-ink-faint hover:text-danger" onClick={() => remove(f)} aria-label={`Borrar ${f.filename}`}>×</button>}
              </li>
            ))}
          </ul>
        )}
        <input ref={input} type="file" multiple className="hidden" onChange={(e) => { void upload(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-ghost btn-sm" onClick={() => input.current?.click()} disabled={busy > 0}>{busy > 0 ? "Subiendo…" : "Subir archivos"}</button>
          <button className="btn-ghost btn-sm" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>🔗 Agregar enlace</button>
          <span className="text-[11px] text-ink-faint">{files.length === 0 ? "Arrastra aquí actas, presentaciones o lo que se trató. " : ""}Máx. {MAX_MB} MB por archivo.</span>
        </div>
        {adding && (
          <form onSubmit={addLink} className="mt-2 flex flex-wrap items-center gap-2">
            <input className="field-sm min-w-0 flex-[2_1_14rem]" type="text" inputMode="url" placeholder="https://drive.google.com/…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} aria-label="Enlace" required autoFocus />
            <input className="field-sm min-w-0 flex-[1_1_9rem]" placeholder="Nombre (opcional)" maxLength={200} value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} aria-label="Nombre del enlace" />
            <button className="btn-primary btn-sm" disabled={busy > 0 || !linkUrl.trim()}>Agregar</button>
          </form>
        )}
      </div>
      {hidden > 0 && <p className="mt-1 text-[11px] text-ink-faint">Hay archivos de esta reunión que no ves: solo los ven los invitados, quien la agendó y los líderes.</p>}
    </section>
  );
}
