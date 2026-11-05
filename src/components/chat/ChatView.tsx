"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import { cn, formatBytes, formatDateTime } from "@/lib/ui";
import { CHAT_EMOJIS, QUICK_REACTIONS, applyInsertedRefs, makeToken, snippetOf, splitMessage, type RefKind } from "@/lib/scrum/chat";
import Avatar from "@/components/ui/Avatar";
import { PaperclipIcon } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";

// Tipos que devuelve la API (ver src/lib/chatData.ts).
type ResolvedRef = { kind: RefKind; id: string; label: string; sub: string | null; href: string | null; missing: boolean };
export type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string; color: string | null } | null;
  refs: ResolvedRef[];
  files: Array<{ id: string; filename: string; mimeType: string; size: number }>;
  replyTo: { id: string; author: string | null; snippet: string } | null;
  reactions: Array<{ emoji: string; count: number; users: string[]; userIds: string[] }>;
};
type IndexItem = { id: string; label: string; sub: string };
type ChatIndex = { projects: IndexItem[]; issues: IndexItem[]; sprints: IndexItem[]; users: IndexItem[] };
type Suggestion = IndexItem & { kind: RefKind; short: string };
type Pending = { id: string; filename: string; mimeType: string; size: number };

const POLL_MS = 2000;
const GROUP_MS = 5 * 60 * 1000;
const IMAGE_RE = /^image\/(png|jpe?g|gif|webp)$/;

const CHIP_STYLE: Record<RefKind, string> = {
  project: "border-rust/40 bg-surface text-rust",
  issue: "border-moss bg-surface text-moss-ink",
  sprint: "border-blue bg-surface text-blue",
  user: "border-line-strong bg-surface text-ink-soft",
};
const KIND_LABEL: Record<RefKind, string> = { project: "Proyecto", issue: "Ticket", sprint: "Sprint", user: "Persona" };

// En pantallas táctiles Enter hace salto de línea (se envía con el botón).
const isTouch = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
const dayKey = (iso: string) => new Date(iso).toDateString();
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Hoy";
  if (d.toDateString() === yesterday.toDateString()) return "Ayer";
  return d.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
}

// Chat general del equipo. Con projectId muestra solo los mensajes que mencionan
// ese proyecto, y lo que se escribe queda mencionándolo.
export default function ChatView({ initial, currentUserId, isLead, projectId, fill }: { initial: ChatMessage[]; currentUserId: string; isLead: boolean; projectId?: string; fill?: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [index, setIndex] = useState<ChatIndex | null>(null);
  const [trigger, setTrigger] = useState<{ char: "#" | "@"; query: string; start: number } | null>(null);
  const [active, setActive] = useState(0);
  const inserted = useRef<Array<{ text: string; token: string }>>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastRef = useRef<string | null>(initial.length ? initial.reduce((max, m) => (m.updatedAt > max ? m.updatedAt : max), initial[0].updatedAt) : null);

  const projectParam = projectId ? `project=${projectId}` : "";

  // Quita mensajes borrados y suelta la cita de las respuestas que los mencionaban.
  const removeLocally = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const gone = new Set(ids);
    setMessages((prev) => prev.filter((m) => !gone.has(m.id)).map((m) => (m.replyTo && gone.has(m.replyTo.id) ? { ...m, replyTo: null } : m)));
    setReplyTo((r) => (r && gone.has(r.id) ? null : r));
  }, []);

  const merge = useCallback((incoming: ChatMessage[]) => {
    if (incoming.length === 0) return;
    // Los mensajes que ya estaban se reemplazan (reacciones, citas); los nuevos van al final.
    setMessages((prev) => {
      const byId = new Map(incoming.map((m) => [m.id, m]));
      const known = new Set(prev.map((m) => m.id));
      const merged = prev.map((m) => byId.get(m.id) ?? m);
      const fresh = incoming.filter((m) => !known.has(m.id));
      return fresh.length ? [...merged, ...fresh] : merged;
    });
    const newest = incoming.reduce((max, m) => (m.updatedAt > max ? m.updatedAt : max), incoming[0].updatedAt);
    if (!lastRef.current || newest > lastRef.current) lastRef.current = newest;
  }, []);

  // Cambios cada 2 s (solo con la pestaña visible y sin apilar consultas).
  useEffect(() => {
    let running = false;
    async function poll() {
      if (document.visibilityState !== "visible" || running) return;
      running = true;
      try {
        const qs = [lastRef.current ? `after=${encodeURIComponent(lastRef.current)}` : "", projectParam].filter(Boolean).join("&");
        const res = await api<{ messages: ChatMessage[]; deleted: string[] }>(`/api/chat/messages${qs ? `?${qs}` : ""}`);
        if (res.ok) {
          removeLocally(res.data.deleted);
          merge(res.data.messages);
        }
      } finally {
        running = false;
      }
    }
    const timer = setInterval(poll, POLL_MS);
    const onVisible = () => void poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [merge, removeLocally, projectParam]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // El índice para # y @ se pide la primera vez que se necesita.
  const loadIndex = useCallback(async () => {
    if (index) return;
    const res = await api<ChatIndex>("/api/chat/index");
    if (res.ok) setIndex(res.data);
  }, [index]);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!trigger || !index) return [];
    const q = trigger.query.toLowerCase();
    const match = (i: IndexItem) => !q || i.label.toLowerCase().includes(q);
    if (trigger.char === "@") return index.users.filter(match).slice(0, 8).map((u) => ({ ...u, kind: "user" as const, short: `@${u.label}` }));
    return [
      ...index.projects.filter(match).slice(0, 4).map((p) => ({ ...p, kind: "project" as const, short: `#${p.label}` })),
      ...index.issues.filter(match).slice(0, 5).map((i) => ({ ...i, kind: "issue" as const, short: `#${i.label.split(" ")[0]}` })),
      ...index.sprints.filter(match).slice(0, 3).map((s) => ({ ...s, kind: "sprint" as const, short: `#${s.label}` })),
    ].slice(0, 9);
  }, [trigger, index]);

  function onChange(value: string, caret: number) {
    setDraft(value);
    const m = value.slice(0, caret).match(/(^|\s)([#@])([^\s#@]*)$/);
    if (m) {
      setTrigger({ char: m[2] as "#" | "@", query: m[3], start: caret - m[3].length - 1 });
      setActive(0);
      void loadIndex();
    } else {
      setTrigger(null);
    }
  }

  function pick(s: Suggestion) {
    if (!trigger || !inputRef.current) return;
    const caret = inputRef.current.selectionStart ?? draft.length;
    const before = draft.slice(0, trigger.start);
    const after = draft.slice(caret);
    inserted.current.push({ text: s.short, token: makeToken(s.kind, s.id) });
    setDraft(`${before}${s.short} ${after}`);
    setTrigger(null);
    const pos = before.length + s.short.length + 1;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
    });
  }

  function insertEmoji(emoji: string) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    setDraft(draft.slice(0, start) + emoji + draft.slice(end));
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  async function upload(files: File[]) {
    for (const file of files) {
      setUploading((n) => n + 1);
      const form = new FormData();
      form.append("file", file, file.name || "imagen.png");
      try {
        const res = await fetch("/api/chat/files", { method: "POST", body: form });
        const json = await res.json().catch(() => null);
        if (!res.ok) toast.error(json?.error ?? "No se pudo subir el archivo");
        else setPending((p) => [...p, json as Pending]);
      } catch {
        toast.error("No hay conexión con el servidor");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function send() {
    if (busy || uploading > 0) return;
    if (!draft.trim() && pending.length === 0) return;
    let body = applyInsertedRefs(draft.trim(), inserted.current);
    if (projectId && !body.includes(`[[project:${projectId}]]`)) body = `${makeToken("project", projectId)} ${body}`.trim();
    setBusy(true);
    const res = await api<ChatMessage>("/api/chat/messages", "POST", { body, fileIds: pending.map((f) => f.id), replyToId: replyTo?.id ?? null });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setDraft("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setPending([]);
    setReplyTo(null);
    inserted.current = [];
    setTrigger(null);
    merge([res.data]);
  }

  async function remove(m: ChatMessage) {
    const ok = await confirm("¿Eliminar este mensaje para todos? Se borra por completo.", { confirmLabel: "Eliminar", danger: true });
    if (!ok) return;
    const res = await api(`/api/chat/messages/${m.id}`, "DELETE");
    if (!res.ok) return toast.error(res.error);
    removeLocally([m.id]);
  }

  async function react(m: ChatMessage, emoji: string) {
    const res = await api<ChatMessage>(`/api/chat/messages/${m.id}/reactions`, "POST", { emoji });
    if (!res.ok) return toast.error(res.error);
    merge([res.data]);
  }

  function jumpTo(id: string) {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return toast.info("Ese mensaje es más antiguo y no está cargado");
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setHighlight(id);
    setTimeout(() => setHighlight(null), 1600);
  }

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden bg-card",
        // En el celular, con "fill", el chat ocupa toda la pantalla bajo la barra (sin tarjeta ni márgenes).
        fill ? "h-[calc(100dvh-7.5rem)] sm:h-[min(74vh,700px)] sm:rounded-xl sm:border sm:border-line-strong sm:shadow-hard" : "h-[70dvh] max-h-[700px] rounded-xl border border-line-strong shadow-hard"
      )}
    >
      {/* Mensajes: fondo suave para que las burbujas blancas se distingan */}
      <ul className="flex-1 space-y-1 overflow-y-auto bg-chat-bg px-2 py-3 sm:px-5 sm:py-4" aria-live="polite">
        {messages.length === 0 && (
          <li className="mx-auto my-10 w-fit rounded-full bg-surface/80 px-4 py-1.5 text-sm text-ink-soft shadow-hard-sm">Todavía no hay mensajes. Escribí el primero.</li>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
          const grouped = !newDay && !!prev && prev.author?.id === m.author?.id && !m.replyTo && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_MS;
          return (
            <Fragment key={m.id}>
              {newDay && (
                <li className="flex justify-center py-2" aria-hidden="true">
                  <span className="rounded-full bg-surface/90 px-3 py-0.5 text-[11px] font-semibold capitalize text-ink-soft shadow-hard-sm">{dayLabel(m.createdAt)}</span>
                </li>
              )}
              <MessageRow
                m={m}
                grouped={grouped}
                canDelete={m.author?.id === currentUserId || isLead}
                mine={m.author?.id === currentUserId}
                currentUserId={currentUserId}
                highlighted={highlight === m.id}
                onDelete={() => void remove(m)}
                onReply={() => {
                  setReplyTo(m);
                  inputRef.current?.focus();
                }}
                onReact={(emoji) => void react(m, emoji)}
                onJump={jumpTo}
              />
            </Fragment>
          );
        })}
        <div ref={endRef} />
      </ul>

      {/* Escribir */}
      <div
        className={cn("relative border-t border-line-strong bg-surface p-3 transition-colors", dragging && "bg-card-2")}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(Array.from(e.dataTransfer.files));
        }}
      >
        {trigger && suggestions.length > 0 && (
          <ul className="absolute bottom-full left-3 right-3 z-20 mb-1 max-h-64 overflow-y-auto rounded-lg border border-line-strong bg-surface shadow-hard-lg" role="listbox">
            {suggestions.map((s, i) => (
              <li key={`${s.kind}:${s.id}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(s);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm", i === active ? "bg-card-2" : "")}
                >
                  <span className={cn("shrink-0 rounded-full border px-1.5 text-[10px] font-bold uppercase", CHIP_STYLE[s.kind])}>{KIND_LABEL[s.kind]}</span>
                  <span className="min-w-0 flex-1 truncate text-ink">{s.label}</span>
                  {s.sub && <span className="shrink-0 text-xs text-ink-faint">{s.sub}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {trigger && index && suggestions.length === 0 && (
          <p className="absolute bottom-full left-3 mb-1 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-xs text-ink-faint shadow-hard">Sin resultados para “{trigger.query}”.</p>
        )}

        {replyTo && (
          <div className="mb-2 flex items-start gap-2 rounded-lg border-l-4 border-rust bg-card-2 px-3 py-1.5 text-xs">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-rust">Respondiendo a {replyTo.author?.name ?? "Usuario eliminado"}</p>
              <p className="truncate text-ink-soft">{snippetOf(replyTo.body, replyTo.files.length > 0) || "Mensaje"}</p>
            </div>
            <button type="button" className="text-lg leading-none text-ink-faint hover:text-ink" aria-label="Cancelar respuesta" onClick={() => setReplyTo(null)}>×</button>
          </div>
        )}

        {(pending.length > 0 || uploading > 0) && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pending.map((f) => (
              <span key={f.id} className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-full border border-line-strong bg-paper-deep px-2.5 py-1 text-xs text-ink">
                <PaperclipIcon size={12} />
                <span className="truncate">{f.filename}</span>
                <span className="text-ink-faint">{formatBytes(f.size)}</span>
                <button type="button" className="text-ink-faint hover:text-danger" aria-label={`Quitar ${f.filename}`} onClick={() => setPending((p) => p.filter((x) => x.id !== f.id))}>
                  ×
                </button>
              </span>
            ))}
            {uploading > 0 && <span className="text-xs text-ink-faint">Subiendo…</span>}
          </div>
        )}

        <div className="flex items-end gap-1.5 sm:gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              void upload(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <button type="button" className="btn-ghost shrink-0 !px-2.5 sm:!px-3" onClick={() => fileRef.current?.click()} aria-label="Adjuntar archivos" title="Adjuntar archivos (máx. 5 MB). También podés arrastrarlos o pegar una imagen.">
            <PaperclipIcon size={16} />
            <span className="hidden sm:inline">Adjuntar</span>
          </button>
          <button type="button" className="btn-ghost shrink-0 !px-2.5 sm:!px-3" onClick={() => setEmojiOpen((v) => !v)} aria-expanded={emojiOpen} aria-label="Emojis" title="Emojis">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9.5h.01M15 9.5h.01" />
            </svg>
            <span className="hidden sm:inline">Emoji</span>
          </button>
          <div className="relative min-w-0 flex-1">
            <textarea
              ref={inputRef}
              rows={1}
              className="field max-h-36 min-h-[2.5rem] resize-none rounded-xl bg-paper-deep py-2"
              placeholder={projectId ? "Mensaje sobre el proyecto…" : "Escribí un mensaje…"}
              value={draft}
              maxLength={4000}
              onChange={(e) => {
                onChange(e.target.value, e.target.selectionStart ?? e.target.value.length);
                // crece con el texto, hasta max-h
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 144)}px`;
              }}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files);
                if (files.length) {
                  e.preventDefault();
                  void upload(files);
                }
              }}
              onKeyDown={(e) => {
                if (trigger && suggestions.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((a) => (a + 1) % suggestions.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    pick(suggestions[active]);
                    return;
                  }
                }
                if (e.key === "Escape") setTrigger(null);
                else if (e.key === "Enter" && !e.shiftKey && !isTouch()) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            {emojiOpen && (
              <div className="absolute bottom-full right-0 z-20 mb-1 w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-line-strong bg-surface p-2 shadow-hard-lg">
                <div className="grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto">
                  {CHAT_EMOJIS.map((em) => (
                    <button key={em} type="button" className="rounded p-1 text-lg hover:bg-card-2" onClick={() => insertEmoji(em)} aria-label={`Insertar ${em}`}>
                      {em}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button type="button" className="btn-primary shrink-0 !px-3" disabled={busy || uploading > 0 || (!draft.trim() && pending.length === 0)} onClick={() => void send()} aria-label="Enviar mensaje">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
            <span className="hidden sm:inline">Enviar</span>
          </button>
        </div>
        <p className="mt-1 hidden text-[11px] text-ink-faint sm:block">Enter envía · Shift+Enter salto de línea</p>
      </div>
    </div>
  );
}

function MessageRow({
  m,
  grouped,
  canDelete,
  mine,
  currentUserId,
  highlighted,
  onDelete,
  onReply,
  onReact,
  onJump,
}: {
  m: ChatMessage;
  grouped: boolean;
  canDelete: boolean;
  mine: boolean;
  currentUserId: string;
  highlighted: boolean;
  onDelete: () => void;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onJump: (id: string) => void;
}) {
  const [picker, setPicker] = useState(false);
  const refByKey = new Map(m.refs.map((r) => [`${r.kind}:${r.id}`, r]));
  const color = m.author?.color ?? null;
  const accent = color ?? "var(--rust)";

  return (
    <li id={`msg-${m.id}`} className={cn("group flex items-end gap-2 rounded-xl px-1 py-0.5 transition-colors", mine && "flex-row-reverse", grouped ? "pt-0" : "pt-1.5", highlighted && "bg-surface/70")}>
      {/* Avatar solo en el primer mensaje de cada tanda y solo de los demás */}
      {!mine && (grouped ? <span className="w-[30px] shrink-0" /> : <Link href={m.author ? `/people/${m.author.id}` : "#"} aria-label={`Perfil de ${m.author?.name ?? "usuario"}`}><Avatar name={m.author?.name} userId={m.author?.id} size={30} color={color} /></Link>)}

      <div className={cn("flex min-w-0 max-w-[82%] flex-col sm:max-w-[72%]", mine ? "items-end" : "items-start")}>
        <div
          className={cn(
            "min-w-0 max-w-full rounded-2xl px-3 py-1.5 text-sm text-ink shadow-hard-sm",
            mine ? "rounded-br-md bg-bubble-mine" : "rounded-bl-md border border-line bg-surface"
          )}
        >
          {!mine && !grouped && (
            <p className="mb-0.5 text-xs font-bold" style={{ color: accent }}>
              {m.author ? <Link href={`/people/${m.author.id}`} className="hover:underline">{m.author.name}</Link> : "Usuario eliminado"}
            </p>
          )}

          {m.replyTo && (
            <button
              type="button"
              onClick={() => onJump(m.replyTo!.id)}
              className={cn("mb-1.5 block w-full rounded-lg border-l-4 px-2 py-1 text-left text-xs hover:brightness-95", mine ? "bg-surface/60" : "bg-paper-deep")}
              style={{ borderLeftColor: "var(--rust)" }}
            >
              <span className="block font-semibold text-rust">{m.replyTo.author ?? "Usuario eliminado"}</span>
              <span className="block truncate text-ink-soft">{m.replyTo.snippet}</span>
            </button>
          )}

          {m.body && (
            <p className="whitespace-pre-wrap break-words">
              {splitMessage(m.body).map((seg, i) => {
                if (seg.type === "text") return <span key={i}>{seg.text}</span>;
                if (seg.type === "link")
                  return (
                    <a key={i} href={seg.href} target="_blank" rel="noopener noreferrer nofollow" className="text-rust underline hover:text-rust-dark">
                      {seg.text}
                    </a>
                  );
                return <RefChip key={i} kind={seg.kind} r={refByKey.get(`${seg.kind}:${seg.id}`)} />;
              })}
            </p>
          )}

          {m.files.length > 0 && (
            <div className={cn("flex flex-wrap items-start gap-2", m.body && "mt-2")}>
              {m.files.map((f) =>
                IMAGE_RE.test(f.mimeType) ? (
                  <a key={f.id} href={`/api/chat/files/${f.id}`} target="_blank" rel="noopener noreferrer" title={f.filename}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/chat/files/${f.id}`} alt={f.filename} className="max-h-56 max-w-full rounded-lg border border-line" loading="lazy" />
                  </a>
                ) : (
                  <a key={f.id} href={`/api/chat/files/${f.id}`} download={f.filename} className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2 py-1 text-xs text-ink hover:border-rust">
                    <PaperclipIcon size={12} />
                    <span className="truncate">{f.filename}</span>
                    <span className="text-ink-faint">{formatBytes(f.size)}</span>
                  </a>
                )
              )}
            </div>
          )}

          <p className="mt-0.5 text-right text-[10px] text-ink-faint" title={formatDateTime(m.createdAt)}>{timeOf(m.createdAt)}</p>
        </div>

        {m.reactions.length > 0 && (
          <div className={cn("-mt-1 flex flex-wrap gap-1 px-1", mine && "justify-end")}>
            {m.reactions.map((r) => {
              const iReacted = r.userIds.includes(currentUserId);
              return (
                <button
                  key={r.emoji}
                  type="button"
                  onClick={() => onReact(r.emoji)}
                  title={r.users.join(", ")}
                  className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-px text-xs shadow-hard-sm", iReacted ? "border-rust bg-chip-tint text-rust" : "border-line-strong bg-surface text-ink-soft hover:border-rust")}
                >
                  <span>{r.emoji}</span>
                  <span className="font-semibold">{r.count}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className={cn("relative mt-0.5 flex items-center gap-3 px-1 text-[11px] opacity-100 sm:opacity-0 sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100", mine && "flex-row-reverse")}>
          <button type="button" className="text-ink-soft hover:text-rust" onClick={onReply}>Responder</button>
          <button type="button" className="text-ink-soft hover:text-rust" onClick={() => setPicker((v) => !v)} aria-expanded={picker}>Reaccionar</button>
          {canDelete && (
            <button type="button" className="text-ink-soft hover:text-danger" onClick={onDelete}>Eliminar</button>
          )}
          {picker && (
            <div className={cn("absolute bottom-full z-20 mb-1 flex gap-0.5 rounded-full border border-line-strong bg-surface px-2 py-1 shadow-hard-lg", mine ? "right-0" : "left-0")}>
              {QUICK_REACTIONS.map((em) => (
                <button
                  key={em}
                  type="button"
                  className="rounded-full px-1 text-lg hover:bg-card-2"
                  onClick={() => {
                    setPicker(false);
                    onReact(em);
                  }}
                  aria-label={`Reaccionar con ${em}`}
                >
                  {em}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function RefChip({ kind, r }: { kind: RefKind; r: ResolvedRef | undefined }) {
  const label = r?.label ?? "(eliminado)";
  const cls = cn(
    "mx-0.5 inline-flex max-w-[18rem] items-center gap-1 rounded-full border px-2 py-px align-baseline text-xs font-semibold",
    !r || r.missing ? "border-line-strong bg-paper-deep text-ink-faint line-through" : CHIP_STYLE[kind]
  );
  const title = `${KIND_LABEL[kind]}${r?.sub ? ` · ${r.sub}` : ""}`;
  if (!r || r.missing || !r.href) {
    return (
      <span className={cls} title={title}>
        <span className="truncate">{label}</span>
      </span>
    );
  }
  return (
    <Link href={r.href} className={cn(cls, "hover:brightness-95")} title={title}>
      <span className="truncate">{label}</span>
    </Link>
  );
}
