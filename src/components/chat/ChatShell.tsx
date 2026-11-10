"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ChatView, { type ChatMessage } from "@/components/chat/ChatView";
import { api } from "@/lib/client";
import { cn, timeAgo } from "@/lib/ui";
import { useToast } from "@/components/ui/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";
import Avatar from "@/components/ui/Avatar";
import Modal from "@/components/ui/Modal";
import { HashIcon, LockIcon, UsersIcon } from "@/components/chat/ChatIcons";

export type Person = { id: string; name: string };
export type ShellChannel = { id: string; name: string; kind: "GENERAL" | "REUNIONES" | "CUSTOM" | "PROJECT" | "PRIVATE" | "DIRECT"; projectId: string | null; projectKey: string | null; members: Person[]; peerId: string | null; unread: number; last: { text: string; at: string; author: string | null } | null };

// Chat a pantalla completa, como WhatsApp o Discord: lista de canales a la izquierda (con el último mensaje y los sin leer)
// y la conversación a la derecha. En el celular se ve una sola cosa a la vez: la lista, y al tocar un canal, la conversación.
export default function ChatShell({ channels: initialChannels, activeId, initialMessages, currentUserId, currentUserName, isLead, people }: { channels: ShellChannel[]; activeId: string | null; initialMessages: ChatMessage[]; currentUserId: string; currentUserName: string; isLead: boolean; people: Person[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [channels, setChannels] = useState(initialChannels);
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<"channel" | "direct" | "members" | null>(null);
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
  const normal = filtered.filter((c) => c.kind !== "PROJECT" && c.kind !== "DIRECT");
  const directs = filtered.filter((c) => c.kind === "DIRECT");
  const projects = filtered.filter((c) => c.kind === "PROJECT").sort((a, b) => (b.last?.at ?? "").localeCompare(a.last?.at ?? "") || a.name.localeCompare(b.name));

  async function removeChannel(c: ShellChannel) {
    const msg = c.kind === "PRIVATE" ? `¿Borrar el canal privado "${c.name}"? Sus mensajes se borran para siempre.` : `¿Borrar el canal "${c.name}"? Sus mensajes pasan a General.`;
    if (!(await confirm(msg, { confirmLabel: "Borrar", danger: true }))) return;
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
        {c.kind === "DIRECT" ? (
          <Avatar name={c.name} userId={c.peerId} size={40} />
        ) : (
          <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-xs font-extrabold", c.kind === "PROJECT" ? "border-moss bg-surface font-mono text-moss-ink" : "border-line-strong bg-surface text-rust")}>
            {c.kind === "PROJECT" ? (c.projectKey ?? c.name.slice(0, 3)).slice(0, 4) : c.kind === "REUNIONES" ? "R" : c.kind === "PRIVATE" ? <LockIcon size={17} /> : <HashIcon size={17} />}
          </span>
        )}
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
            <button className="rounded-full border border-line-strong px-2.5 py-0.5 text-xs font-semibold text-ink-soft hover:text-ink" onClick={() => setModal("direct")}>
              Mensaje
            </button>
            {isLead && (
              <button className="rounded-full border border-dashed border-line-strong px-2.5 py-0.5 text-xs font-semibold text-ink-soft hover:text-ink" onClick={() => setModal("channel")}>
                + Canal
              </button>
            )}
          </div>
          <input className="field-sm w-full" placeholder="Buscar canal o proyecto…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar canal" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {normal.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Canales</p>
              <ul>{normal.map(row)}</ul>
            </>
          )}
          {directs.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Mensajes directos</p>
              <ul>{directs.map(row)}</ul>
            </>
          )}
          {projects.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Proyectos</p>
              <ul>{projects.map(row)}</ul>
            </>
          )}
          {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-ink-faint">Nada coincide.</p>}
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
                  ) : active.kind === "DIRECT" ? (
                    active.name
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      {active.kind === "PRIVATE" ? <LockIcon size={15} className="text-ink-soft" /> : <HashIcon size={15} className="text-ink-soft" />}
                      {active.name}
                    </span>
                  )}
                </h2>
                <p className="truncate text-xs text-ink-faint">
                  {active.kind === "DIRECT" ? "Mensaje directo · solo ustedes dos" : active.kind === "PRIVATE" ? `Canal privado · ${active.members.map((m) => (m.id === currentUserId ? "tú" : m.name.split(" ")[0])).join(", ")}` : active.kind === "PROJECT" ? "Chat del proyecto" : active.kind === "REUNIONES" ? "Convocatorias y resoluciones de reuniones (/reunion)" : active.kind === "GENERAL" ? "Conversación y avisos de todo el equipo" : "Canal del equipo"}
                </p>
              </div>
              {active.kind === "PROJECT" && active.projectId && (
                <Link href={`/projects/${active.projectId}/board`} className="shrink-0 text-xs font-semibold text-rust hover:underline">Abrir proyecto</Link>
              )}
              {isLead && active.kind === "PRIVATE" && (
                <button className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-ink-soft hover:text-ink" onClick={() => setModal("members")}>
                  <UsersIcon size={14} /> Miembros
                </button>
              )}
              {isLead && (active.kind === "CUSTOM" || active.kind === "PRIVATE") && (
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
      <NewChannelModal open={modal === "channel"} onClose={() => setModal(null)} people={people} onCreated={async (id) => { setModal(null); await refresh(); open(id); }} />
      <DirectModal open={modal === "direct"} onClose={() => setModal(null)} people={people} onOpen={async (id) => { setModal(null); await refresh(); open(id); }} />
      {active?.kind === "PRIVATE" && <MembersModal key={active.id} open={modal === "members"} onClose={() => setModal(null)} channel={active} people={people} currentUserId={currentUserId} onSaved={async () => { setModal(null); await refresh(); router.refresh(); }} />}
    </main>
  );
}

function PeoplePicker({ people, selected, onToggle }: { people: Person[]; selected: Set<string>; onToggle: (id: string) => void }) {
  const [q, setQ] = useState("");
  const shown = people.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="space-y-2">
      <input className="field-sm w-full" placeholder="Buscar persona…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar persona" />
      <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-lg border border-line">
        {shown.map((p) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-card-2">
              <input type="checkbox" checked={selected.has(p.id)} onChange={() => onToggle(p.id)} className="h-4 w-4 accent-[var(--rust)]" />
              <Avatar name={p.name} userId={p.id} size={24} />
              <span className="min-w-0 flex-1 truncate text-ink">{p.name}</span>
            </label>
          </li>
        ))}
        {shown.length === 0 && <li className="px-3 py-4 text-center text-xs text-ink-faint">Nadie coincide.</li>}
      </ul>
    </div>
  );
}

function useToggleSet(initial: string[] = []) {
  const [set, setSet] = useState(() => new Set(initial));
  const toggle = (id: string) => setSet((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return [set, toggle, setSet] as const;
}

function NewChannelModal({ open, onClose, people, onCreated }: { open: boolean; onClose: () => void; people: Person[]; onCreated: (id: string) => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [priv, setPriv] = useState(false);
  const [members, toggle, setMembers] = useToggleSet();
  const [busy, setBusy] = useState(false);
  const ready = name.trim().length >= 2 && (!priv || members.size > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await api<{ id: string }>("/api/chat/channels", "POST", { name, kind: priv ? "PRIVATE" : "CUSTOM", memberIds: [...members] });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setName("");
    setPriv(false);
    setMembers(new Set());
    onCreated(res.data.id);
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo canal" width="max-w-md">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-ink-soft" htmlFor="canal-nombre">Nombre</label>
          <input id="canal-nombre" className="field w-full" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} placeholder="ej. diseño, liderazgo…" />
        </div>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de canal">
          {([[false, "Abierto", "Todo el equipo lo ve", HashIcon], [true, "Privado", "Solo las personas que elijas", LockIcon]] as const).map(([val, label, hint, Icon]) => (
            <button key={label} type="button" role="radio" aria-checked={priv === val} onClick={() => setPriv(val)} className={cn("rounded-lg border p-3 text-left transition-colors", priv === val ? "border-rust bg-chip-tint" : "border-line hover:border-line-strong")}>
              <span className="flex items-center gap-1.5 text-sm font-bold text-ink"><Icon size={15} /> {label}</span>
              <span className="mt-0.5 block text-xs text-ink-soft">{hint}</span>
            </button>
          ))}
        </div>
        {priv && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-ink-soft">Quién entra ({members.size} + tú)</p>
            <PeoplePicker people={people} selected={members} onToggle={toggle} />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
          <button className="btn-primary btn-sm" disabled={!ready || busy}>{busy ? "Creando…" : "Crear canal"}</button>
        </div>
      </form>
    </Modal>
  );
}

function DirectModal({ open, onClose, people, onOpen }: { open: boolean; onClose: () => void; people: Person[]; onOpen: (id: string) => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const shown = people.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  async function pick(p: Person) {
    const res = await api<{ id: string }>("/api/chat/direct", "POST", { userId: p.id });
    if (!res.ok) return toast.error(res.error);
    setQ("");
    onOpen(res.data.id);
  }
  return (
    <Modal open={open} onClose={onClose} title="Mensaje directo" width="max-w-sm">
      <div className="space-y-2">
        <input data-autofocus className="field-sm w-full" placeholder="¿A quién le escribes?" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar persona" />
        <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line">
          {shown.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => pick(p)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-card-2">
                <Avatar name={p.name} userId={p.id} size={28} />
                <span className="min-w-0 flex-1 truncate font-semibold text-ink">{p.name}</span>
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="px-3 py-4 text-center text-xs text-ink-faint">Nadie coincide.</li>}
        </ul>
        <p className="text-xs text-ink-faint">La conversación es solo entre ustedes dos.</p>
      </div>
    </Modal>
  );
}

function MembersModal({ open, onClose, channel, people, currentUserId, onSaved }: { open: boolean; onClose: () => void; channel: ShellChannel; people: Person[]; currentUserId: string; onSaved: () => void }) {
  const toast = useToast();
  const [members, toggle] = useToggleSet(channel.members.map((m) => m.id).filter((id) => id !== currentUserId));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const res = await api(`/api/chat/channels/${channel.id}`, "PATCH", { memberIds: [...members] });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    onSaved();
  }
  return (
    <Modal open={open} onClose={onClose} title={`Miembros de ${channel.name}`} width="max-w-md">
      <div className="space-y-3">
        <PeoplePicker people={people} selected={members} onToggle={toggle} />
        <div className="flex justify-end gap-2">
          <button className="btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
          <button className="btn-primary btn-sm" disabled={busy || members.size === 0} onClick={save}>{busy ? "Guardando…" : "Guardar"}</button>
        </div>
      </div>
    </Modal>
  );
}
