"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { timeAgo, cn } from "@/lib/ui";
import EmptyState from "@/components/ui/EmptyState";
import { repeatLabel, type NoticeKind } from "@/lib/scrum/notifPolicy";

type Item = { id: string; kind: string; label: string; title: string; body: string; url: string | null; count: number; priority: string; createdAt: string; readAt: string | null; pending: boolean };

export default function InboxView() {
  const router = useRouter();
  const [items, setItems] = useState<Item[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [onlyUnread, setOnlyUnread] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{ items: Item[]; unread: number }>(`/api/notifications?limit=100${onlyUnread ? "&unread=1" : ""}`);
    if (res.ok) {
      setItems(res.data.items);
      setUnread(res.data.unread);
    }
  }, [onlyUnread]);
  useEffect(() => {
    void load();
  }, [load]);

  async function open(i: Item) {
    if (!i.readAt) {
      await api("/api/notifications/read", "POST", { ids: [i.id] });
      window.dispatchEvent(new Event("notifs-changed"));
    }
    if (i.url) {
      const internal = i.url.startsWith("/") ? i.url : i.url.replace(window.location.origin, "");
      if (internal.startsWith("/")) router.push(internal);
      else window.open(i.url, "_blank", "noopener,noreferrer");
    } else await load();
  }

  async function markAll() {
    await api("/api/notifications/read", "POST", { all: true });
    window.dispatchEvent(new Event("notifs-changed"));
    await load();
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} /> Solo sin leer
        </label>
        <button className="btn-ghost btn-sm ml-auto" disabled={unread === 0} onClick={markAll}>Marcar todo como leído{unread ? ` (${unread})` : ""}</button>
      </div>
      {items === null ? (
        <div className="skeleton h-24 w-full" />
      ) : items.length === 0 ? (
        <EmptyState title="Sin avisos" hint="Cuando alguien te mencione, te asigne un ticket o haya novedades en tus proyectos, aparecerá aquí." />
      ) : (
        <ul className="divide-y divide-line-strong overflow-hidden rounded-lg border border-line bg-card">
          {items.map((i) => (
            <li key={i.id}>
              <button onClick={() => open(i)} className={cn("flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-card-2", !i.readAt && "bg-chip-tint/40")}>
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", i.readAt ? "bg-transparent" : i.priority === "urgent" ? "bg-danger" : "bg-rust")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{i.title}{i.count > 1 ? <span className="ml-1.5 font-normal text-ink-faint">({repeatLabel(i.kind as NoticeKind, i.count)})</span> : null}</span>
                  {i.body && <span className="block truncate text-xs text-ink-soft">{i.body}</span>}
                  <span className="mt-0.5 block text-[11px] text-ink-faint">
                    {i.label} · {timeAgo(i.createdAt)}
                    {i.pending ? " · irá en el próximo resumen" : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
