"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/ui/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";
import { cn } from "@/lib/ui";

type Channel = { id: string; name: string; kind: "GENERAL" | "REUNIONES" | "CUSTOM" };

// Pestañas de canales del chat del equipo. Los líderes crean canales propios y borran los que crearon.
export default function ChannelTabs({ channels, activeId, canManage }: { channels: Channel[]; activeId: string; canManage: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const res = await api<Channel>("/api/chat/channels", "POST", { name });
    if (!res.ok) return toast.error(res.error);
    setName("");
    setAdding(false);
    router.push(`/chat?canal=${res.data.id}`);
    router.refresh();
  }

  async function remove(c: Channel) {
    if (!(await confirm(`¿Borrar el canal "${c.name}"? Sus mensajes pasan a General.`, { confirmLabel: "Borrar", danger: true }))) return;
    const res = await api(`/api/chat/channels/${c.id}`, "DELETE");
    if (!res.ok) return toast.error(res.error);
    router.push("/chat");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2 pt-2 sm:px-0" role="tablist" aria-label="Canales">
      {channels.map((c) => (
        <span key={c.id} className="inline-flex items-center">
          <Link
            href={c.kind === "GENERAL" ? "/chat" : `/chat?canal=${c.id}`}
            role="tab"
            aria-selected={c.id === activeId}
            className={cn("rounded-full border px-3 py-1 text-sm font-semibold", c.id === activeId ? "border-rust bg-chip-tint text-rust" : "border-line-strong bg-surface text-ink-soft hover:text-ink")}
          >
            # {c.name}
          </Link>
          {canManage && c.kind === "CUSTOM" && c.id === activeId && (
            <button onClick={() => remove(c)} className="ml-1 text-xs text-ink-faint hover:text-danger" aria-label={`Borrar el canal ${c.name}`}>
              Borrar
            </button>
          )}
        </span>
      ))}
      {canManage &&
        (adding ? (
          <form onSubmit={create} className="inline-flex items-center gap-1">
            <input autoFocus className="field h-8 w-36 py-0 text-sm" placeholder="Nombre del canal" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn-primary btn-sm" disabled={name.trim().length < 2}>Crear</button>
            <button type="button" className="text-xs text-ink-faint hover:text-ink" onClick={() => setAdding(false)}>Cancelar</button>
          </form>
        ) : (
          <button onClick={() => setAdding(true)} className="rounded-full border border-dashed border-line-strong px-3 py-1 text-sm text-ink-faint hover:text-ink">+ Canal</button>
        ))}
    </div>
  );
}
