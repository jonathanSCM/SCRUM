"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useToast } from "@/components/ui/Toaster";
import { CATEGORY_LABEL, DIGEST_OPTIONS, type Prefs } from "@/lib/scrum/notifPolicy";

const DIGEST_LABEL: Record<number, string> = { 0: "Sin resumen (solo en la bandeja)", 15: "Cada 15 minutos", 30: "Cada 30 minutos (recomendado)", 60: "Cada hora", 120: "Cada 2 horas" };

// Cuándo y qué avisos recibes: lo importante al instante; lo demás junto, en un resumen.
export default function NotifPrefsCard() {
  const toast = useToast();
  const [p, setP] = useState<Prefs | null>(null);

  useEffect(() => {
    api<Prefs>("/api/notifications/prefs").then((r) => r.ok && setP(r.data));
  }, []);

  async function save(patch: Partial<Prefs>) {
    if (!p) return;
    const next = { ...p, ...patch };
    setP(next);
    const res = await api<Prefs>("/api/notifications/prefs", "PUT", { ...patch, ...(patch.quietEnabled ? { tz: Intl.DateTimeFormat().resolvedOptions().timeZone } : {}) });
    if (!res.ok) return toast.error(res.error);
    setP(res.data);
  }

  if (!p) return <div className="skeleton h-10 w-full" />;
  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-display text-sm font-bold text-ink">Cuándo recibir los avisos</h3>
        <p className="text-xs text-ink-soft">
          <b>Al instante:</b> menciones, mensajes directos, /urgente, /ayuda, /reunion, avisos del equipo, cuando te asignan un ticket o inicia un sprint. <b>En un resumen:</b> cambios y comentarios en tus tickets, tickets completados o nuevos y cambios del proyecto. Todo queda siempre en tu bandeja de Avisos.
        </p>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-ink-soft">Resumen de lo demás</label>
        <select className="field" value={p.digestMinutes} onChange={(e) => save({ digestMinutes: Number(e.target.value) })}>
          {DIGEST_OPTIONS.map((m) => <option key={m} value={m}>{DIGEST_LABEL[m]}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={p.quietEnabled} onChange={(e) => save({ quietEnabled: e.target.checked })} /> Horas de silencio <span className="text-ink-faint">(solo lo urgente avisa; el resto espera)</span>
        </label>
        {p.quietEnabled && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
            de <input type="time" className="field-sm w-28" value={p.quietStart} onChange={(e) => save({ quietStart: e.target.value })} />
            a <input type="time" className="field-sm w-28" value={p.quietEnd} onChange={(e) => save({ quietEnd: e.target.value })} />
            <span className="text-xs text-ink-faint">({p.tz})</span>
          </div>
        )}
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold text-ink-soft">Qué avisos quieres recibir (los demás quedan solo en la bandeja)</p>
        <ul className="space-y-1">
          {(Object.keys(CATEGORY_LABEL) as Array<keyof typeof CATEGORY_LABEL>).map((c) => (
            <li key={c}>
              <label className="flex items-center gap-2 text-sm text-ink-soft">
                <input type="checkbox" checked={!p.muted.includes(c)} onChange={(e) => save({ muted: e.target.checked ? p.muted.filter((x) => x !== c) : [...p.muted, c] })} /> {CATEGORY_LABEL[c]}
              </label>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-ink-faint">Las menciones, los mensajes directos, /urgente y /ayuda siempre te avisan.</p>
      </div>
    </section>
  );
}
