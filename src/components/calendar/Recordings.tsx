"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { cn } from "@/lib/ui";
import { useToast } from "@/components/ui/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";
import { useTimezone } from "@/components/TimezoneProvider";
import { formatDay, formatTime } from "@/lib/scrum/countries";

type Rec = {
  id: string;
  title: string | null;
  status: "RECEIVING" | "PENDING" | "TRANSCRIBING" | "DONE" | "FAILED";
  error: string | null;
  startedAt: string;
  recordedBy: { id: string; name: string } | null;
  captions: string;
  transcript: string;
  parts: { total: number; done: number; failed: number };
  audio: Array<{ part: number; size: number }>;
  canManage: boolean;
};
type Data = { hidden: number; transcriptionConfigured: boolean; recordings: Rec[] };

const STATUS: Record<Rec["status"], { label: string; cls: string }> = {
  RECEIVING: { label: "Grabando / recibiendo", cls: "text-blue" },
  PENDING: { label: "En cola para transcribir", cls: "text-warn" },
  TRANSCRIBING: { label: "Transcribiendo…", cls: "text-warn" },
  DONE: { label: "Lista", cls: "text-moss-ink" },
  FAILED: { label: "Falló la transcripción", cls: "text-danger" },
};

// Resalta lo que se busca dentro de la transcripción.
function Highlighted({ text, q }: { text: string; q: string }) {
  const parts = useMemo(() => {
    const term = q.trim();
    if (!term) return [text];
    const re = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
    return text.split(re);
  }, [text, q]);
  return (
    <>
      {parts.map((p, i) => (q.trim() && p.toLowerCase() === q.trim().toLowerCase() ? <mark key={i} className="rounded bg-amber-300/60 px-0.5 text-ink">{p}</mark> : <span key={i}>{p}</span>))}
    </>
  );
}

const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;

// Reproductor del audio de la grabación: las partes (≈10 min cada una) suenan una tras otra; cada una se puede descargar.
function AudioPlayer({ meetingId, rec, onDeleted }: { meetingId: string; rec: Rec; onDeleted: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [idx, setIdx] = useState(0);
  const ref = useRef<HTMLAudioElement>(null);
  const parts = rec.audio;
  const src = (p: number, download = false) => `/api/meetings/${meetingId}/recordings/${rec.id}/audio/${p}${download ? "?download=1" : ""}`;
  const cur = parts[Math.min(idx, parts.length - 1)];
  const total = parts.reduce((n, p) => n + p.size, 0);

  async function remove() {
    if (!(await confirm("¿Borrar el audio de esta grabación? La transcripción y los subtítulos se conservan.", { confirmLabel: "Borrar audio", danger: true }))) return;
    const res = await api(`/api/meetings/${meetingId}/recordings/${rec.id}/audio`, "DELETE");
    if (!res.ok) return toast.error(res.error);
    toast.success("Audio borrado");
    onDeleted();
  }

  return (
    <div className="space-y-2 rounded-lg border border-line bg-card-2/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">Audio de la reunión</p>
        <span className="text-[11px] text-ink-faint">{parts.length} {parts.length === 1 ? "parte" : "partes"} · {mb(total)}</span>
        {rec.canManage && <button className="ml-auto text-xs text-ink-faint hover:text-danger" onClick={remove}>Borrar audio</button>}
      </div>
      {/* key: al cambiar de parte se carga el audio nuevo; las partes siguientes suenan solas */}
      <audio key={cur.part} ref={ref} controls preload="metadata" className="w-full" src={src(cur.part)} autoPlay={idx > 0} onEnded={() => setIdx((i) => (i + 1 < parts.length ? i + 1 : i))}>
        Tu navegador no puede reproducir este audio.
      </audio>
      {parts.length > 1 && (
        <ul className="flex flex-wrap gap-1.5">
          {parts.map((p, i) => (
            <li key={p.part} className="flex items-center overflow-hidden rounded-md border border-line text-xs">
              <button onClick={() => setIdx(i)} aria-pressed={i === idx} className={cn("px-2 py-1 font-semibold", i === idx ? "bg-rust text-white" : "text-ink-soft hover:text-ink")}>Parte {p.part}</button>
              <a href={src(p.part, true)} className="border-l border-line px-2 py-1 text-ink-soft hover:text-rust" title={`Descargar la parte ${p.part} (${mb(p.size)})`} aria-label={`Descargar la parte ${p.part}`}>↓</a>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <a href={src(cur.part, true)} className="font-semibold text-rust hover:underline">Descargar {parts.length > 1 ? `la parte ${cur.part}` : "el audio"}</a>
        {parts.length > 1 && <span className="text-ink-faint">Cada parte es un archivo aparte (.webm); suenan en orden.</span>}
      </div>
    </div>
  );
}

// Grabaciones y transcripciones de una reunión (las sube la extensión de Chrome para Meet).
export default function Recordings({ meetingId, onChanged }: { meetingId: string; onChanged: () => void }) {
  const { tz } = useTimezone();
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<Record<string, "audio" | "captions">>({});
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const res = await api<Data>(`/api/meetings/${meetingId}/recordings`);
    if (res.ok) setData(res.data);
  }, [meetingId]);
  useEffect(() => {
    void load();
  }, [load]);
  const busy = !!data?.recordings.some((r) => r.status === "RECEIVING" || r.status === "PENDING" || r.status === "TRANSCRIBING");
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 8000);
    return () => clearInterval(t);
  }, [busy, load]);

  async function retry(r: Rec) {
    const res = await api(`/api/meetings/${meetingId}/recordings/${r.id}`, "PATCH", { retry: true });
    if (!res.ok) return toast.error(res.error);
    toast.success("Reintentando la transcripción");
    void load();
  }
  async function remove(r: Rec) {
    if (!(await confirm("¿Borrar esta grabación con su transcripción?", { confirmLabel: "Borrar", danger: true }))) return;
    const res = await api(`/api/meetings/${meetingId}/recordings/${r.id}`, "DELETE");
    if (!res.ok) return toast.error(res.error);
    void load();
    onChanged();
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  if (!data || (data.recordings.length === 0 && data.hidden === 0)) {
    return (
      <section>
        <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-faint">Grabaciones y transcripción</h3>
        <p className="rounded-lg border border-dashed border-line-strong p-3 text-xs text-ink-faint">Todavía no hay grabaciones. Con la extensión de Chrome, en Google Meet pulsa «Grabar esta reunión» y elige esta reunión.</p>
      </section>
    );
  }

  return (
    <section>
      <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-faint">Grabaciones y transcripción</h3>
      {!data.transcriptionConfigured && data.recordings.some((r) => r.status === "PENDING") && (
        <p className="mb-2 rounded-lg border border-line-strong bg-card-2/60 p-2.5 text-xs text-ink-soft">La transcripción del audio todavía no está configurada. Un líder puede pegar la clave de OpenAI en <Link href="/settings/integrations" className="font-semibold text-rust hover:underline">Integraciones</Link>; el audio espera y se transcribe solo.</p>
      )}
      <ul className="space-y-2">
        {data.recordings.map((r) => {
          const hasAudio = !!r.transcript.trim();
          const current = tab[r.id] ?? (hasAudio ? "audio" : "captions");
          const text = current === "audio" ? r.transcript : r.captions;
          const isOpen = open === r.id;
          return (
            <li key={r.id} className="rounded-lg border border-line-strong">
              <button className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left" onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink">{r.title || "Grabación"}</span>
                  <span className="block text-[11px] text-ink-faint">{formatDay(r.startedAt, tz, { day: "numeric", month: "short" })} {formatTime(r.startedAt, tz)}{r.recordedBy ? ` · grabó ${r.recordedBy.name}` : ""}{r.parts.total ? ` · audio ${r.parts.done}/${r.parts.total}` : ""}</span>
                </span>
                <span className={cn("lozenge", STATUS[r.status].cls)}>{STATUS[r.status].label}</span>
              </button>
              {r.error && r.status !== "DONE" && <p className="border-t border-line px-3 py-1.5 text-xs text-danger">{r.error}</p>}
              {isOpen && (
                <div className="space-y-2 border-t border-line p-3">
                  {r.audio.length > 0 && <AudioPlayer meetingId={meetingId} rec={r} onDeleted={() => void load()} />}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-md border border-line" role="group" aria-label="Qué ver">
                      {([["audio", "Transcripción del audio"], ["captions", "Subtítulos de Meet"]] as const).map(([k, l]) => (
                        <button key={k} onClick={() => setTab((t) => ({ ...t, [r.id]: k }))} aria-pressed={current === k} className={cn("px-2.5 py-1 text-xs font-bold", current === k ? "bg-rust text-white" : "text-ink-soft hover:text-ink")}>{l}</button>
                      ))}
                    </div>
                    <input className="field-sm min-w-0 flex-1" placeholder="Buscar en el texto…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar en la transcripción" />
                    {text && <button className="btn-ghost btn-sm" onClick={() => copy(text)}>Copiar</button>}
                  </div>
                  {text ? (
                    <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-card-2/50 p-3 text-sm leading-relaxed text-ink-soft"><Highlighted text={text} q={q} /></div>
                  ) : (
                    <p className="rounded-lg bg-card-2/50 p-3 text-xs text-ink-faint">{current === "audio" ? (r.status === "DONE" ? "Esta grabación no trajo audio." : "La transcripción del audio todavía no está lista.") : "Esta grabación no trajo subtítulos."}</p>
                  )}
                  {r.canManage && (
                    <div className="flex gap-2">
                      {r.parts.failed > 0 && <button className="btn-ghost btn-sm" onClick={() => retry(r)}>Reintentar transcripción</button>}
                      <button className="ml-auto text-xs text-ink-faint hover:text-danger" onClick={() => remove(r)}>Borrar grabación</button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {data.hidden > 0 && <p className="mt-1.5 text-[11px] text-ink-faint">{data.hidden === 1 ? "Hay 1 grabación" : `Hay ${data.hidden} grabaciones`} de esta reunión que no ves: solo las ven los invitados, quien la agendó, quien grabó y los líderes.</p>}
    </section>
  );
}
