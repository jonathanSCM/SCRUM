"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import Avatar from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/client";
import { cn } from "@/lib/ui";
import { useTimezone } from "@/components/TimezoneProvider";
import { dayKey, formatDay, offsetLabel, zoneName, zonedToUtc } from "@/lib/scrum/countries";
import { AlertIcon, CalendarIcon, LifebuoyIcon, MegaphoneIcon, UsersIcon } from "@/components/chat/ChatIcons";

type Person = { id: string; label: string };
type To = "general" | "personas" | "reunion";
type Level = "normal" | "urgente" | "ayuda";

// "Avisar": lo mismo que los comandos /noti, /reunion, /urgente y /ayuda, pero con botones (sin tener que escribirlos).
// Un miembro puede avisar a personas o pedir ayuda al equipo; avisar a todo el equipo y convocar reuniones es de quien lidera.
export default function NoticeModal({ open, onClose, isLead, currentUserId, channelId }: { open: boolean; onClose: () => void; isLead: boolean; currentUserId: string; channelId?: string }) {
  const toast = useToast();
  const [to, setTo] = useState<To>(isLead ? "general" : "personas");
  const [level, setLevel] = useState<Level>("normal");
  const [message, setMessage] = useState("");
  const { tz } = useTimezone();
  const [date, setDate] = useState(() => dayKey(new Date(), tz));
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(60);
  const [meetUrl, setMeetUrl] = useState("");
  const [topic, setTopic] = useState("");
  const startsAt = (() => {
    const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const t = time.match(/^(\d{2}):(\d{2})$/);
    return m && t ? zonedToUtc(Number(m[1]), Number(m[2]), Number(m[3]), Number(t[1]), Number(t[2]), tz) : null;
  })();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [people, setPeople] = useState<Person[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || people) return;
    void api<{ users: Person[] }>("/api/chat/index").then((r) => r.ok && setPeople(r.data.users.filter((u) => u.id !== currentUserId)));
  }, [open, people, currentUserId]);

  // Un miembro no puede avisar a todo el equipo con nivel normal o urgente: solo pedir ayuda.
  const memberTeamHelp = !isLead && to === "general";
  const destinations: Array<{ id: To; label: string; hint: string; Icon: typeof UsersIcon; show: boolean }> = [
    { id: "general", label: isLead ? "Todo el equipo" : "Pedir ayuda al equipo", hint: isLead ? "Llega a todas las personas" : "Aviso de ayuda a todos", Icon: isLead ? MegaphoneIcon : LifebuoyIcon, show: true },
    { id: "personas", label: "Personas", hint: "Elige a quién", Icon: UsersIcon, show: true },
    { id: "reunion", label: "Reunión", hint: "Convocatoria con fecha", Icon: CalendarIcon, show: isLead },
  ];
  const effectiveLevel: Level = memberTeamHelp ? "ayuda" : level;
  const ready = to === "reunion" ? !!startsAt && !!topic.trim() : !!message.trim() && (to !== "personas" || picked.size > 0);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const notice = to === "reunion" ? { to, level: effectiveLevel, topic, startsAt: startsAt!.toISOString(), durationMin: duration, ...(meetUrl.trim() ? { meetUrl: meetUrl.trim() } : {}) } : to === "personas" ? { to, level: effectiveLevel, message, userIds: [...picked] } : { to, level: effectiveLevel, message };
    const res = await api<{ summary: string }>("/api/chat/command", "POST", { notice, channelId });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(res.data.summary);
    setMessage("");
    setMeetUrl("");
    setTopic("");
    setPicked(new Set());
    setLevel("normal");
    onClose();
  }

  const shown = (people ?? []).filter((p) => p.label.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const command = to === "reunion" ? "/reunion mañana 10:30: tema" : to === "personas" ? "/noti persona nombre: mensaje" : memberTeamHelp ? "/ayuda mensaje" : "/noti general mensaje";

  return (
    <Modal open={open} onClose={onClose} title="Enviar un aviso" width="max-w-lg">
      <form onSubmit={send} className="space-y-4">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Destino del aviso">
          {destinations.filter((d) => d.show).map(({ id, label, hint, Icon }) => (
            <button key={id} type="button" role="radio" aria-checked={to === id} onClick={() => setTo(id)} className={cn("rounded-lg border p-2.5 text-left transition-colors", to === id ? "border-rust bg-chip-tint" : "border-line hover:border-line-strong")}>
              <span className="flex items-center gap-1.5 text-sm font-bold text-ink"><Icon size={15} className="shrink-0" /> {label}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-ink-soft">{hint}</span>
            </button>
          ))}
        </div>

        {to === "personas" && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-ink-soft">Para ({picked.size})</p>
            <input className="field-sm w-full" placeholder="Buscar persona…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar persona" />
            <ul className="max-h-40 divide-y divide-line overflow-y-auto rounded-lg border border-line">
              {shown.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-card-2">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--rust)]" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
                    <Avatar name={p.label} userId={p.id} size={22} />
                    <span className="min-w-0 flex-1 truncate text-ink">{p.label}</span>
                  </label>
                </li>
              ))}
              {people && shown.length === 0 && <li className="px-3 py-3 text-center text-xs text-ink-faint">Nadie coincide.</li>}
              {!people && <li className="px-3 py-3 text-center text-xs text-ink-faint">Cargando…</li>}
            </ul>
          </div>
        )}

        {to === "reunion" ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink-soft" htmlFor="aviso-tema">Tema de la reunión</label>
              <input id="aviso-tema" className="field w-full" maxLength={200} placeholder="ej. Revisión del sprint" value={topic} onChange={(e) => setTopic(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-3 space-y-1 sm:col-span-1">
                <label className="text-xs font-semibold text-ink-soft" htmlFor="aviso-fecha">Fecha</label>
                <input id="aviso-fecha" type="date" className="field w-full" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-ink-soft" htmlFor="aviso-hora">Hora</label>
                <input id="aviso-hora" type="time" className="field w-full" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-ink-soft" htmlFor="aviso-dur">Dura</label>
                <select id="aviso-dur" className="field w-full" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                  {[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : m === 60 ? "1 hora" : m % 60 ? `${m / 60} h` : `${m / 60} horas`}</option>)}
                </select>
              </div>
            </div>
            <p className="text-[11px] text-ink-faint">{startsAt ? `${formatDay(startsAt, tz)} · hora de ${zoneName(tz)} (${offsetLabel(startsAt, tz)}). Cada persona la verá en su hora.` : "Elige fecha y hora."} Puedes cambiar tu país en tu perfil.</p>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink-soft" htmlFor="aviso-meet">Enlace de Meet (opcional)</label>
              <input id="aviso-meet" className="field w-full" maxLength={300} placeholder="https://meet.google.com/…" value={meetUrl} onChange={(e) => setMeetUrl(e.target.value)} />
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <label className="text-xs font-semibold text-ink-soft" htmlFor="aviso-mensaje">Mensaje</label>
            <textarea id="aviso-mensaje" className="field min-h-[5.5rem] w-full" maxLength={1000} placeholder="Escribe el aviso…" value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
        )}

        {!memberTeamHelp && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-ink-soft">Importancia</p>
            <div className="flex gap-2" role="radiogroup" aria-label="Importancia">
              {([["normal", "Normal", MegaphoneIcon, "border-rust bg-chip-tint text-ink"], ["urgente", "Urgente", AlertIcon, "border-danger bg-danger-bg text-danger"], ["ayuda", "Pide ayuda", LifebuoyIcon, "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-400"]] as const).map(([id, label, Icon, on]) => (
                <button key={id} type="button" role="radio" aria-checked={level === id} onClick={() => setLevel(id)} className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-bold transition-colors", level === id ? on : "border-line text-ink-soft hover:border-line-strong")}>
                  <Icon size={14} className="shrink-0" /> {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] text-ink-faint">Llega a la bandeja, al navegador y al teléfono. Si prefieres escribirlo en el chat: <span className="font-mono">{command}</span></p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
          <button className="btn-primary btn-sm" disabled={!ready || busy}>{busy ? "Enviando…" : "Enviar aviso"}</button>
        </div>
      </form>
    </Modal>
  );
}
