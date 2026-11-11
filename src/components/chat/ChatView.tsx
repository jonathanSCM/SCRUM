"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import { cn, formatBytes, formatDateTime } from "@/lib/ui";
import { CHAT_EMOJIS, QUICK_REACTIONS, applyInsertedRefs, makeToken, reactorsText, snippetOf, splitMessage, type RefKind } from "@/lib/scrum/chat";
import Avatar from "@/components/ui/Avatar";
import { PaperclipIcon } from "@/components/ui/Icons";
import { AlertIcon, BookIcon, CalendarIcon, LifebuoyIcon, MegaphoneIcon } from "@/components/chat/ChatIcons";
import { useToast } from "@/components/ui/Toaster";
import { isCommand, COMMAND_HELP, COMMAND_LIST, personaQuery } from "@/lib/scrum/chatCommands";
import { useConfirm } from "@/components/ConfirmDialog";

// Tipos que devuelve la API (ver src/lib/chatData.ts).
type ResolvedRef = { kind: RefKind; id: string; label: string; sub: string | null; href: string | null; missing: boolean };
export type ChatMessage = {
  id: string;
  body: string;
  level?: "AYUDA" | "URGENTE" | null;
  announce?: boolean;
  channel?: string | null;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string; color: string | null } | null;
  refs: ResolvedRef[];
  files: Array<{ id: string; filename: string; mimeType: string; size: number }>;
  replyTo: { id: string; author: string | null; snippet: string } | null;
  reactions: Array<{ emoji: string; count: number; users: string[]; userIds: string[] }>;
};
type IndexItem = { id: string; label: string; sub: string };
type ChatIndex = { projects: IndexItem[]; issues: IndexItem[]; sprints: IndexItem[]; users: IndexItem[]; cards: IndexItem[] };
type Suggestion = IndexItem & { kind: RefKind; short: string };
type Pending = { id: string; filename: string; mimeType: string; size: number };

// Cabecera (título) de los avisos enviados por comando: franja de color con ícono y quién lo envió.
const ANNOUNCE_TONE = {
  general: { label: "Aviso al equipo", band: "bg-rust/10 text-rust", border: "border-line" },
  reunion: { label: "Convocatoria", band: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", border: "border-emerald-500/40" },
  urgente: { label: "Urgente", band: "bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] text-danger", border: "border-[color-mix(in_srgb,var(--danger)_60%,transparent)]" },
  ayuda: { label: "Pide ayuda", band: "bg-amber-500/15 text-amber-700 dark:text-amber-400", border: "border-amber-500/60" },
} as const;
function announceTone(m: ChatMessage) {
  return ANNOUNCE_TONE[m.level === "URGENTE" ? "urgente" : m.level === "AYUDA" ? "ayuda" : m.body.startsWith("Reunión · ") ? "reunion" : "general"];
}
function AnnounceHeader({ m }: { m: ChatMessage }) {
  const tone = announceTone(m);
  const Icon = m.level === "URGENTE" ? AlertIcon : m.level === "AYUDA" ? LifebuoyIcon : m.body.startsWith("Reunión · ") ? CalendarIcon : MegaphoneIcon;
  return (
    <div className={cn("-mx-3 -mt-1.5 mb-1.5 flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider", tone.band)}>
      <Icon size={14} />
      <span>{tone.label}</span>
      {m.author && <span className="ml-auto truncate pl-3 text-[11px] font-semibold normal-case tracking-normal opacity-80">{m.author.name.split(" ")[0]}</span>}
    </div>
  );
}

const POLL_MS = 2000;
const GROUP_MS = 5 * 60 * 1000;
const IMAGE_RE = /^image\/(png|jpe?g|gif|webp)$/;

const CHIP_STYLE: Record<RefKind, string> = {
  project: "border-rust/40 bg-surface text-rust",
  issue: "border-moss bg-surface text-moss-ink",
  sprint: "border-blue bg-surface text-blue",
  user: "border-line-strong bg-surface text-ink-soft",
  card: "border-amber-500/60 bg-surface text-amber-700 dark:text-amber-400",
};
const KIND_LABEL: Record<RefKind, string> = { project: "Proyecto", issue: "Ticket", sprint: "Sprint", user: "Persona", card: "Biblioteca" };

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
export default function ChatView({ initial, currentUserId, currentUserName = "", isLead, projectId, fill, channelId, announceOnly, pane, mentionProjectId }: { initial: ChatMessage[]; currentUserId: string; currentUserName?: string; isLead: boolean; projectId?: string; fill?: boolean; channelId?: string; announceOnly?: boolean; pane?: boolean; mentionProjectId?: string }) {
  // pane: ocupa todo el espacio de su contenedor (vista tipo WhatsApp/Discord). mentionProjectId: canal de un proyecto (el # busca dentro de ese proyecto).
  const scopeProject = projectId ?? mentionProjectId;
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
  const [attachMenu, setAttachMenu] = useState(false);
  const [index, setIndex] = useState<ChatIndex | null>(null);
  const [trigger, setTrigger] = useState<{ char: "#" | "@" | "!"; query: string; start: number } | null>(null);
  const [active, setActive] = useState(0);
  // Segundo nivel de #: tras elegir un proyecto se listan solo sus sprints y tickets.
  const [scope, setScope] = useState<{ id: string; label: string; start: number } | null>(null);
  const [scoped, setScoped] = useState<Record<string, { sprints: IndexItem[]; issues: IndexItem[] }>>({});
  const inserted = useRef<Array<{ text: string; token: string }>>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastRef = useRef<string | null>(initial.length ? initial.reduce((max, m) => (m.updatedAt > max ? m.updatedAt : max), initial[0].updatedAt) : null);

  // Qué se sincroniza: el chat de un proyecto, un canal, o los avisos del equipo (solo lectura).
  const projectParam = announceOnly ? "announce=1" : [projectId ? `project=${projectId}` : "", channelId ? `channel=${channelId}` : ""].filter(Boolean).join("&");
  const readOnly = !!announceOnly;

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

  // Marca el canal como leído al abrirlo y cada vez que llegan mensajes mientras se está viendo.
  useEffect(() => {
    if (!channelId || announceOnly) return;
    const t = setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      void api("/api/chat/read", "POST", { channelId }).then(() => window.dispatchEvent(new Event("chat-read")));
    }, 600);
    return () => clearTimeout(t);
  }, [channelId, announceOnly, messages.length]);

  // El índice para # y @ se pide la primera vez que se necesita.
  const loadIndex = useCallback(async () => {
    if (index) return;
    const res = await api<ChatIndex>("/api/chat/index");
    if (res.ok) setIndex(res.data);
  }, [index]);

  const loadScope = useCallback(
    async (id: string) => {
      if (scoped[id]) return;
      const res = await api<{ sprints: IndexItem[]; issues: IndexItem[] }>(`/api/chat/index?project=${encodeURIComponent(id)}`);
      if (res.ok) setScoped((prev) => ({ ...prev, [id]: res.data }));
    },
    [scoped]
  );

  // Proyecto dentro del que se busca: el del chat del proyecto, o el que se acaba de elegir con #.
  const scopeId = scopeProject ?? (scope && trigger && trigger.start === scope.start ? scope.id : null);
  const scopeLoading = !!trigger && trigger.char === "#" && !!scopeId && !scoped[scopeId];

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!trigger || !index) return [];
    const q = trigger.query.toLowerCase();
    const match = (i: IndexItem) => !q || i.label.toLowerCase().includes(q);
    if (trigger.char === "@") return index.users.filter(match).slice(0, 8).map((u) => ({ ...u, kind: "user" as const, short: `@${u.label}` }));
    const issueS = (i: IndexItem) => ({ ...i, kind: "issue" as const, short: `#${i.label.split(" ")[0]}` });
    const sprintS = (s: IndexItem) => ({ ...s, kind: "sprint" as const, short: `#${s.label}` });
    // "!" es solo para tarjetas de la Biblioteca (así nunca se confunden con proyectos, que usan "#").
    if (trigger.char === "!") return (index.cards ?? []).filter(match).slice(0, 10).map((c) => ({ ...c, kind: "card" as const, short: `!${c.label}` }));
    // Nivel 2: dentro de un proyecto.
    if (scopeId) {
      const data = scoped[scopeId];
      if (!data) return [];
      return [...data.sprints.filter(match).slice(0, 6).map(sprintS), ...data.issues.filter(match).slice(0, 8).map(issueS)];
    }
    // Atajo: escribir la clave de un ticket (SAI-12) lo busca directo, sin pasar por el proyecto.
    if (/^[a-z][a-z0-9]*-\d*$/i.test(q)) return index.issues.filter(match).slice(0, 8).map(issueS);
    // Nivel 1: solo proyectos.
    // Se busca por nombre o por código (SAI); el código exacto va primero.
    const byCode = (i: IndexItem) => i.sub.toLowerCase() === q;
    const projectMatch = (i: IndexItem) => match(i) || (!!q && i.sub.toLowerCase().startsWith(q));
    return [...[...index.projects.filter(projectMatch)].sort((a, b) => Number(byCode(b)) - Number(byCode(a))).slice(0, 12).map((p) => ({ ...p, kind: "project" as const, short: `#${p.label}` }))];
  }, [trigger, index, scopeId, scoped]);

  // Autocompletado de comandos: "/" lista los comandos; en "/noti persona …" se sugieren nombres.
  const cmdItems = useMemo<Array<{ key: string; label: string; hint: string; apply: (d: string) => string }>>(() => {
    if (/^\/[a-z]*( [a-z]*)?$/i.test(draft)) {
      return COMMAND_LIST.filter((c) => c.cmd.startsWith(draft.toLowerCase()) && (isLead || c.cmd === "/noti persona" || c.cmd === "/ayuda"))
        .map((c) => ({ key: c.cmd, label: c.cmd, hint: c.hint, apply: () => c.insert }));
    }
    const pq = personaQuery(draft);
    if (pq && index) {
      const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const q = norm(pq.query);
      return index.users.filter((u) => norm(u.label).includes(q)).slice(0, 8).map((u) => ({ key: u.id, label: u.label, hint: "", apply: (d: string) => `${d.slice(0, pq.start)}${u.label}` }));
    }
    return [];
  }, [draft, index, isLead]);
  const cmdOpen = !trigger && cmdItems.length > 0;

  // Botón "Biblioteca": inserta un "!" y abre la lista de tarjetas.
  function openLibraryPicker() {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? draft.length;
    const before = draft.slice(0, caret);
    const lead = before && !/\s$/.test(before) ? " " : "";
    const next = `${before}${lead}!${draft.slice(caret)}`;
    const at = before.length + lead.length;
    setDraft(next);
    setTrigger({ char: "!", query: "", start: at });
    setActive(0);
    void loadIndex();
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + 1, at + 1);
    });
  }

  function onChange(value: string, caret: number) {
    setDraft(value);
    if (/^\/noti/i.test(value)) void loadIndex();
    // "!" abre la Biblioteca, pero no dentro de un comando (/noti !urgente …).
    const m = value.slice(0, caret).match(/(^|\s)([#@!])([^\s#@!]*)$/);
    if (m && !(m[2] === "!" && value.startsWith("/"))) {
      setTrigger({ char: m[2] as "#" | "@" | "!", query: m[3], start: caret - m[3].length - 1 });
      setActive(0);
      void loadIndex();
      if (scopeProject && m[2] === "#") void loadScope(scopeProject);
    } else {
      setTrigger(null);
      setScope(null);
    }
  }

  function pick(s: Suggestion) {
    if (!trigger || !inputRef.current) return;
    const caret = inputRef.current.selectionStart ?? draft.length;
    const before = draft.slice(0, trigger.start);
    const after = draft.slice(caret);
    inserted.current.push({ text: s.short, token: makeToken(s.kind, s.id) });
    // Elegir un proyecto abre el segundo nivel: se deja un "#" nuevo para elegir su sprint o ticket.
    if (s.kind === "project" && !scopeProject && trigger.char === "#") {
      setDraft(`${before}${s.short} #${after}`);
      const at = before.length + s.short.length + 1;
      setScope({ id: s.id, label: s.label, start: at });
      setTrigger({ char: "#", query: "", start: at });
      setActive(0);
      void loadScope(s.id);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(at + 1, at + 1);
      });
      return;
    }
    setDraft(`${before}${s.short} ${after}`);
    setTrigger(null);
    setScope(null);
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
    // Comandos (/noti …, /reunion …): no se publican como mensaje, se ejecutan.
    if (isCommand(draft)) {
      setBusy(true);
      const cr = await api<{ summary: string }>("/api/chat/command", "POST", { body: draft.trim() });
      setBusy(false);
      if (!cr.ok) return toast.error(cr.error);
      toast.success(cr.data.summary);
      setDraft("");
      if (inputRef.current) inputRef.current.style.height = "auto";
      return;
    }
    let body = applyInsertedRefs(draft.trim(), inserted.current);
    if (projectId && !body.includes(`[[project:${projectId}]]`)) body = `${makeToken("project", projectId)} ${body}`.trim();
    setBusy(true);
    const res = await api<ChatMessage>("/api/chat/messages", "POST", { body, fileIds: pending.map((f) => f.id), replyToId: replyTo?.id ?? null, channelId: channelId ?? null });
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
        pane
          ? "h-full min-h-0"
          : // En el celular, con "fill", el chat ocupa toda la pantalla bajo la barra (sin tarjeta ni márgenes).
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
                currentUserName={currentUserName}
                highlighted={highlight === m.id}
                showChannel={!!announceOnly}
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
      {!readOnly && (
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
        {cmdOpen && (
          <ul className="absolute bottom-full left-3 right-3 z-20 mb-1 max-h-64 overflow-y-auto rounded-lg border border-line-strong bg-surface shadow-hard-lg" role="listbox">
            {cmdItems.map((c, i) => (
              <li key={c.key} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setDraft(c.apply(draft));
                    inputRef.current?.focus();
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm", i === active ? "bg-card-2" : "")}
                >
                  <span className="shrink-0 font-mono font-semibold text-rust">{c.label}</span>
                  {c.hint && <span className="min-w-0 flex-1 truncate text-xs text-ink-faint">{c.hint}</span>}
                </button>
              </li>
            ))}
            {personaQuery(draft) && <li className="border-t border-line px-3 py-1 text-[11px] text-ink-faint">Coma para otra persona · dos puntos (:) y luego el mensaje</li>}
          </ul>
        )}
        {trigger && suggestions.length > 0 && (
          <ul className="absolute bottom-full left-3 right-3 z-20 mb-1 max-h-64 overflow-y-auto rounded-lg border border-line-strong bg-surface shadow-hard-lg" role="listbox">
            {scopeId && !scopeProject && scope && (
              <li className="border-b border-line px-3 py-1 text-[11px] text-ink-faint">Dentro de <b className="text-ink-soft">{scope.label}</b> · sprints y tickets · Esc deja solo el proyecto</li>
            )}
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
          <p className="absolute bottom-full left-3 mb-1 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-xs text-ink-faint shadow-hard">{scopeLoading ? "Cargando…" : trigger.char === "!" && !trigger.query ? "Todavía no hay tarjetas en la Biblioteca." : `Sin resultados para “${trigger.query}”.`}</p>
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
          <div className="relative shrink-0">
            <button type="button" className="btn-ghost !px-2.5 sm:!px-3" onClick={() => setAttachMenu((v) => !v)} aria-haspopup="menu" aria-expanded={attachMenu} aria-label="Adjuntar" title="Adjuntar un archivo o una tarjeta de la Biblioteca">
              <PaperclipIcon size={16} />
              <span className="hidden sm:inline">Adjuntar</span>
            </button>
            {attachMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setAttachMenu(false)} aria-hidden="true" />
                <div role="menu" className="absolute bottom-full left-0 z-40 mb-2 w-60 overflow-hidden rounded-xl border border-line-strong bg-surface shadow-hard">
                  <button role="menuitem" type="button" className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-card-2" onClick={() => { setAttachMenu(false); fileRef.current?.click(); }}>
                    <PaperclipIcon size={16} className="mt-0.5 shrink-0 text-ink-soft" />
                    <span>
                      <span className="block text-sm font-semibold text-ink">Subir archivo</span>
                      <span className="block text-xs text-ink-faint">Desde tu equipo (máx. 5 MB). También puedes arrastrarlo o pegar una imagen.</span>
                    </span>
                  </button>
                  <button role="menuitem" type="button" className="flex w-full items-start gap-2.5 border-t border-line px-3 py-2.5 text-left hover:bg-card-2" onClick={() => { setAttachMenu(false); openLibraryPicker(); }}>
                    <BookIcon size={16} className="mt-0.5 shrink-0 text-ink-soft" />
                    <span>
                      <span className="block text-sm font-semibold text-ink">Biblioteca</span>
                      <span className="block text-xs text-ink-faint">Mencionar una tarjeta con sus archivos.</span>
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
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
              placeholder={projectId ? "Mensaje sobre el proyecto…" : mentionProjectId ? "Escribe un mensaje al canal del proyecto…" : "Escribe un mensaje… (o /noti, /reunion)"}
              title={COMMAND_HELP}
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
                // Escribiendo los nombres de /noti persona (aún sin ":"): Enter no envía, y si la lista no cargó, espera.
                if (e.key === "Enter" && !e.shiftKey && personaQuery(draft) && (!index || cmdItems.length === 0)) {
                  e.preventDefault();
                  void loadIndex();
                  return;
                }
                if (cmdOpen) {
                  const n = cmdItems.length;
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % n); return; }
                  if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + n) % n); return; }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    setDraft(cmdItems[Math.min(active, n - 1)].apply(draft));
                    setActive(0);
                    return;
                  }
                }
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
                if (e.key === "Escape") {
                  // En el segundo nivel, Esc quita el "#" sobrante y deja solo el proyecto.
                  if (trigger && scope && trigger.start === scope.start && !trigger.query) {
                    setDraft((d) => d.slice(0, trigger.start) + d.slice(trigger.start + 1));
                  }
                  setTrigger(null);
                  setScope(null);
                }
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
      )}
    </div>
  );
}

function MessageRow({
  m,
  grouped,
  canDelete,
  mine,
  currentUserId,
  currentUserName,
  highlighted,
  showChannel,
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
  currentUserName: string;
  highlighted: boolean;
  showChannel: boolean;
  onDelete: () => void;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onJump: (id: string) => void;
}) {
  const [picker, setPicker] = useState(false);
  const [who, setWho] = useState<string | null>(null); // emoji abierto en la lista de "quién reaccionó"
  const longPress = useRef<number>(0);
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
            m.announce ? cn("overflow-hidden rounded-bl-md border bg-card sm:min-w-[18rem]", announceTone(m).border) : m.level === "URGENTE" ? "rounded-bl-md border-2 border-danger bg-danger-bg" : m.level === "AYUDA" ? "rounded-bl-md border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/30" : mine ? "rounded-br-md bg-bubble-mine" : "rounded-bl-md border border-line bg-surface"
          )}
        >
          {m.announce && <AnnounceHeader m={m} />}
          {!mine && !grouped && !m.announce && (
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

          {showChannel && m.channel && <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">{m.channel}</p>}
          {!m.announce && m.level && <p className={cn("mb-0.5 text-[10px] font-extrabold uppercase tracking-wide", m.level === "URGENTE" ? "text-danger" : "text-amber-600")}>{m.level === "URGENTE" ? "Urgente" : "Pide ayuda"}</p>}
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
                <span key={r.emoji} className="group/react relative inline-flex">
                  <button
                    type="button"
                    onClick={() => onReact(r.emoji)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setWho(r.emoji);
                    }}
                    onTouchStart={() => {
                      // Mantener pulsado (celular) abre la lista de quién reaccionó.
                      longPress.current = window.setTimeout(() => setWho(r.emoji), 450);
                    }}
                    onTouchEnd={() => window.clearTimeout(longPress.current)}
                    onTouchMove={() => window.clearTimeout(longPress.current)}
                    aria-label={`${r.emoji} ${reactorsText(r.users, iReacted ? currentUserName : null)}. Pulsa para ${iReacted ? "quitar tu reacción" : "reaccionar"}`}
                    className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-px text-xs shadow-hard-sm", iReacted ? "border-rust bg-chip-tint text-rust" : "border-line-strong bg-surface text-ink-soft hover:border-rust")}
                  >
                    <span>{r.emoji}</span>
                    <span className="font-semibold">{r.count}</span>
                  </button>
                  {/* Al pasar el cursor: quién reaccionó (como en Discord) */}
                  <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden w-max max-w-[16rem] -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-center text-[11px] font-medium leading-snug text-paper shadow-hard-lg group-hover/react:block group-focus-within/react:block">
                    <span className="mr-1 text-sm">{r.emoji}</span>
                    {reactorsText(r.users, iReacted ? currentUserName : null)}
                  </span>
                </span>
              );
            })}
            <button type="button" onClick={() => setWho(m.reactions[0].emoji)} className="text-[11px] font-medium text-ink-faint hover:text-rust" aria-label="Ver quién reaccionó">
              ¿Quién?
            </button>
          </div>
        )}

        {who !== null && m.reactions.length > 0 && (
          <ReactionsModal reactions={m.reactions} start={who} currentUserId={currentUserId} onReact={onReact} onClose={() => setWho(null)} />
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


// Lista de quién reaccionó, como en Discord: pestañas por emoji (con el conteo) y las personas de cada una.
function ReactionsModal({ reactions, start, currentUserId, onReact, onClose }: { reactions: ChatMessage["reactions"]; start: string; currentUserId: string; onReact: (emoji: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<string>(reactions.some((r) => r.emoji === start) ? start : "all");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Si una reacción desaparece (alguien la quitó), se vuelve a "Todas".
  const current = tab === "all" || reactions.some((r) => r.emoji === tab) ? tab : "all";
  const total = reactions.reduce((n, r) => n + r.count, 0);
  const rows = (current === "all" ? reactions : reactions.filter((r) => r.emoji === current)).flatMap((r) => r.userIds.map((id, i) => ({ id, name: r.users[i] ?? "Alguien", emoji: r.emoji })));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Quién reaccionó" onClick={onClose}>
      <div className="flex max-h-[70vh] w-full max-w-sm flex-col overflow-hidden rounded-t-xl border border-line-strong bg-surface shadow-hard-lg sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <p className="flex-1 font-display text-sm font-extrabold text-ink">Reacciones</p>
          <button className="text-ink-faint hover:text-ink" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2" role="tablist">
          <button role="tab" aria-selected={current === "all"} onClick={() => setTab("all")} className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold", current === "all" ? "border-rust bg-chip-tint text-rust" : "border-line-strong text-ink-soft")}>
            Todas {total}
          </button>
          {reactions.map((r) => (
            <button key={r.emoji} role="tab" aria-selected={current === r.emoji} onClick={() => setTab(r.emoji)} className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold", current === r.emoji ? "border-rust bg-chip-tint text-rust" : "border-line-strong text-ink-soft")}>
              {r.emoji} {r.count}
            </button>
          ))}
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
          {rows.map((u, i) => (
            <li key={`${u.id}-${u.emoji}-${i}`} className="flex items-center gap-3 px-4 py-2">
              <Avatar name={u.name} userId={u.id} size={28} />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                {u.name}
                {u.id === currentUserId && <span className="ml-1.5 text-xs text-ink-faint">(tú)</span>}
              </span>
              <span className="text-base" aria-hidden="true">{u.emoji}</span>
              {u.id === currentUserId && (
                <button className="text-xs text-ink-faint hover:text-danger" onClick={() => onReact(u.emoji)}>Quitar</button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
