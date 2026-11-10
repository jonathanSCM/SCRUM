"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ChatView, { type ChatMessage } from "@/components/chat/ChatView";
import { api } from "@/lib/client";
import { cn, timeAgo } from "@/lib/ui";
import { useToast } from "@/components/ui/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";

export type ShellChannel = { id: string; name: string; kind: "GENERAL" | "REUNIONES" | "CUSTOM" | "PROJECT"; projectId: string | null; projectKey: string | null; unread: number; last: { text: string; at: string; author: string | null } | null };

// Chat a pantalla completa, como WhatsApp o Discord: lista de canales a la izquierda (con el último mensaje y los sin leer)
// y la conversación a la derecha. En el celular se ve una sola cosa a la vez: la lista, y al tocar un canal, la conversación.
export default function ChatShell({ channels: initialChannels, activeId, initialMessages, currentUserId, currentUserName, isLead }: { channels: ShellChannel[]; activeId: string | null; initialMessages: ChatMessage[]; currentUserId: string; currentUserName: string; isLead: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [channels, setChannels] = useState(initialChannels);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  const active = channels.find((c) => c.id === activeId) ?? initialChannels.find((c) => c.id === activeId) ?? null;

  // La altura es todo lo que queda de la pantalla debajo de la barra superior.
  useLayoutEffect(() => {
    const fit = () => {
      const top = boxRef.current?.getBoundingClientRect().top ?? 0;
      const gap = window.innerWidth >= 640 ? 16 : 0;
      setHeight(Math.max(320, window.innerHeight - top - gap));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    const res = await api<ShellChannel[]>("/api/chat/channels");
    if (res.ok) setChannels(res.data);
  }, []);
  useEffect(() => {
    const t = setInterval(refresh, 15_000);
    const onRead = () => void refresh();
    window.addEventListener("chat-read", onRead);
    window.addEventListener("visibilitychange", onRead);
    return () => {
      clearInterval(t);
      window.removeEventListener("chat-read", onRead);
      window.removeEventListener("visibilitychange", onRead);
    };
  }, [refresh]);

  // En pantallas grandes se abre General solo; en el celular se muestra la lista.
  useEffect(() => {
    if (!activeId && window.matchMedia("(min-width: 1024px)").matches) {
      const general = initialChannels.find((c) => c.kind === "GENERAL");
      if (general) router.replace(`/chat?canal=${general.id}`);
    }
  }, [activeId, initialChannels, router]);

  const open = (id: string) => router.push(`/chat?canal=${id}`);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return channels.filter((c) => !t || `${c.name} ${c.projectKey ?? ""}`.toLowerCase().includes(t));
  }, [channels, q]);
  const normal = filtered.filter((c) => c.kind !== "PROJECT");
  const projects = filtered.filter((c) => c.kind === "PROJECT").sort((a, b) => (b.last?.at ?? "").localeCompare(a.last?.at ?? "") || a.name.localeCompare(b.name));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const res = await api<ShellChannel>("/api/chat/channels", "POST", { name });
    if (!res.ok) return toast.error(res.error);
    setName("");
    setAdding(false);
    await refresh();
    open(res.data.id);
  }

  async function removeChannel(c: ShellChannel) {
    if (!(await confirm(`¿Borrar el canal "${c.name}"? Sus mensajes pasan a General.`, { confirmLabel: "Borrar", danger: true }))) return;
    const res = await api(`/api/chat/channels/${c.id}`, "DELETE");
    if (!res.ok) return toast.error(res.error);
    router.push("/chat");
    router.refresh();
  }

  const row = (c: ShellChannel) => (
    <li key={c.id}>
      <button
        onClick={() => open(c.id)}
        aria-current={c.id === activeId ? "true" : undefined}
        className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-card-2", c.id === activeId && "bg-chip-tint")}
      >
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-xs font-extrabold", c.kind === "PROJECT" ? "border-moss bg-surface font-mono text-moss-ink" : "border-line-strong bg-surface text-rust")}>
          {c.kind === "PROJECT" ? (c.projectKey ?? c.name.slice(0, 3)).slice(0, 4) : c.kind === "REUNIONES" ? "R" : "#"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={cn("min-w-0 flex-1 truncate text-sm text-ink", c.unread > 0 ? "font-extrabold" : "font-semibold")}>{c.name}</span>
            {c.last && <span className={cn("shrink-0 text-[11px]", c.unread > 0 ? "font-semibold text-rust" : "text-ink-faint")}>{timeAgo(c.last.at)}</span>}
          </span>
          <span className="flex items-center gap-2">
            <span className={cn("min-w-0 flex-1 truncate text-xs", c.unread > 0 ? "text-ink" : "text-ink-faint")}>
              {c.last ? `${c.last.author ? `${c.last.author.split(" ")[0]}: ` : ""}${c.last.text}` : "Sin mensajes todavía"}
            </span>
            {c.unread > 0 && c.id !== activeId && <span className="shrink-0 rounded-full bg-rust px-1.5 text-center text-[10px] font-bold leading-[1.1rem] text-white">{c.unread > 99 ? "99+" : c.unread}</span>}
          </span>
        </span>
      </button>
    </li>
  );

  return (
    <main ref={boxRef} style={height ? { height } : undefined} className={cn("mx-auto flex w-full max-w-[1400px] overflow-hidden border-y border-line-strong bg-card sm:rounded-xl sm:border sm:shadow-hard", !height && "h-[70dvh]")}>
      {/* ---- Lista de canales ---- */}
      <aside className={cn("min-h-0 w-full shrink-0 flex-col border-r border-line-strong bg-surface lg:flex lg:w-80", activeId ? "hidden" : "flex")}>
        <div className="space-y-2 border-b border-line px-3 py-3">
          <div className="flex items-center gap-2">
            <h1 className="flex-1 font-display text-xl font-extrabold text-ink">Chat</h1>
            {isLead && (
              <button className="rounded-full border border-dashed border-line-strong px-2.5 py-0.5 text-xs font-semibold text-ink-soft hover:text-ink" onClick={() => setAdding((v) => !v)}>
                + Canal
              </button>
            )}
          </div>
          {adding && (
            <form onSubmit={create} className="flex gap-1.5">
              <input autoFocus className="field-sm min-w-0 flex-1" placeholder="Nombre del canal" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
              <button className="btn-primary btn-sm" disabled={name.trim().length < 2}>Crear</button>
            </form>
          )}
          <input className="field-sm w-full" placeholder="Buscar canal o proyecto…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar canal" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {normal.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Canales</p>
              <ul>{normal.map(row)}</ul>
            </>
          )}
          {projects.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Proyectos</p>
              <ul>{projects.map(row)}</ul>
            </>
          )}
          {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-ink-faint">Ningún canal coincide.</p>}
        </div>
      </aside>

      {/* ---- Conversación ---- */}
      <section className={cn("min-h-0 min-w-0 flex-1 flex-col lg:flex", activeId ? "flex" : "hidden")}>
        {active ? (
          <>
            <header className="flex items-center gap-2 border-b border-line-strong bg-surface px-3 py-2.5">
              <button className="rounded-md px-2 py-1 text-lg leading-none text-ink-soft hover:text-ink lg:hidden" onClick={() => router.push("/chat")} aria-label="Volver a la lista de canales">
                ←
              </button>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-display text-base font-extrabold text-ink">
                  {active.kind === "PROJECT" ? (
                    <>
                      <span className="mr-1.5 font-mono text-xs font-bold text-moss-ink">{active.projectKey}</span>
                      {active.name}
                    </>
                  ) : (
                    `# ${active.name}`
                  )}
                </h2>
                <p className="truncate text-xs text-ink-faint">
                  {active.kind === "PROJECT" ? "Chat del proyecto" : active.kind === "REUNIONES" ? "Convocatorias y resoluciones de reuniones (/reunion)" : active.kind === "GENERAL" ? "Conversación y avisos de todo el equipo" : "Canal del equipo"}
                </p>
              </div>
              {active.kind === "PROJECT" && active.projectId && (
                <Link href={`/projects/${active.projectId}/board`} className="shrink-0 text-xs font-semibold text-rust hover:underline">Abrir proyecto</Link>
              )}
              {isLead && active.kind === "CUSTOM" && (
                <button className="shrink-0 text-xs text-ink-faint hover:text-danger" onClick={() => removeChannel(active)}>Borrar canal</button>
              )}
            </header>
            <div className="min-h-0 flex-1">
              <ChatView key={active.id} pane initial={initialMessages} currentUserId={currentUserId} currentUserName={currentUserName} isLead={isLead} channelId={active.id} mentionProjectId={active.projectId ?? undefined} />
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-ink-faint">Elige un canal para empezar a chatear.</div>
        )}
      </section>
    </main>
  );
}
