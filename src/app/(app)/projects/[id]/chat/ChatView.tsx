"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { formatDateTime, timeAgo } from "@/lib/ui";
import Avatar from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toaster";

export type ChatMessage = { id: string; body: string; createdAt: string; author: { id: string; name: string } | null };

const POLL_MS = 2000;

// Chat del equipo del proyecto. Pregunta por mensajes nuevos cada 2 segundos
// (solo con la pestaña visible) y al volver a ella.
export default function ChatView({ projectId, initial, currentUserId, isLead }: { projectId: string; initial: ChatMessage[]; currentUserId: string; isLead: boolean }) {
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const lastRef = useRef<string | null>(initial.length ? initial[initial.length - 1].createdAt : null);

  const merge = useCallback((incoming: ChatMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const known = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !known.has(m.id));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
    lastRef.current = incoming[incoming.length - 1].createdAt;
  }, []);

  useEffect(() => {
    async function poll() {
      if (document.visibilityState !== "visible") return;
      const url = `/api/projects/${projectId}/messages${lastRef.current ? `?after=${encodeURIComponent(lastRef.current)}` : ""}`;
      const res = await api<ChatMessage[]>(url);
      if (res.ok) merge(res.data);
    }
    let running = false;
    const tick = async () => {
      if (running) return; // no se apilan consultas si el servidor tarda
      running = true;
      try {
        await poll();
      } finally {
        running = false;
      }
    };
    const timer = setInterval(tick, POLL_MS);
    const onVisible = () => void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [projectId, merge]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    const res = await api<ChatMessage>(`/api/projects/${projectId}/messages`, "POST", { body });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setDraft("");
    merge([res.data]);
  }

  async function remove(m: ChatMessage) {
    const res = await api(`/api/messages/${m.id}`, "DELETE");
    if (!res.ok) return toast.error(res.error);
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
  }

  return (
    <div className="flex flex-col border border-line bg-card rounded-lg" style={{ height: "min(70vh, 640px)" }}>
      <ul className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && <li className="py-10 text-center text-sm text-ink-faint">Todavía no hay mensajes. Escribí el primero.</li>}
        {messages.map((m) => {
          const canDelete = m.author?.id === currentUserId || isLead;
          return (
            <li key={m.id} className="group flex gap-3">
              <Avatar name={m.author?.name} size={28} />
              <div className="min-w-0 flex-1">
                <p className="text-xs">
                  <span className="font-bold text-ink">{m.author?.name ?? "Usuario eliminado"}</span>{" "}
                  <span className="text-ink-faint" title={formatDateTime(m.createdAt)}>{timeAgo(m.createdAt)}</span>
                  {canDelete && (
                    <button className="ml-2 hidden text-ink-faint hover:text-danger group-hover:inline" onClick={() => remove(m)}>borrar</button>
                  )}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm text-ink-soft">{m.body}</p>
              </div>
            </li>
          );
        })}
        <div ref={endRef} />
      </ul>
      <div className="flex gap-2 border-t border-line p-3">
        <textarea
          rows={2}
          className="field min-w-0 flex-1"
          placeholder="Escribí un mensaje para el equipo…"
          value={draft}
          maxLength={3000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="btn-primary self-end" disabled={busy || !draft.trim()} onClick={send}>Enviar</button>
      </div>
    </div>
  );
}
