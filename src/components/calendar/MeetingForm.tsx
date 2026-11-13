"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/client";
import { cn } from "@/lib/ui";
import { useToast } from "@/components/ui/Toaster";
import { useTimezone } from "@/components/TimezoneProvider";
import { dayKey, formatDay, formatTime, offsetLabel, zoneName, zonedToUtc } from "@/lib/scrum/countries";
import type { MeetingDTO } from "@/lib/meetings";

type Person = { id: string; name: string };
type Project = { id: string; name: string; key: string | null };

// Agendar o editar una reunión. La hora que escribes es la de TU zona; el servidor la guarda en UTC.
export default function MeetingForm({ meeting, day, isLead, currentUserId, people, projects, onClose, onSaved }: { meeting: MeetingDTO | null; day: string; isLead: boolean; currentUserId: string; people: Person[]; projects: Project[]; onClose: () => void; onSaved: (m: MeetingDTO) => void }) {
  const { tz } = useTimezone();
  const toast = useToast();
  const initial = meeting ? new Date(meeting.startsAt) : null;
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [date, setDate] = useState(initial ? dayKey(initial, tz) : day);
  const [time, setTime] = useState(initial ? formatTime(initial, tz) : "10:00");
  const [duration, setDuration] = useState(meeting ? Math.round((new Date(meeting.endsAt).getTime() - new Date(meeting.startsAt).getTime()) / 60000) : 60);
  const [meetUrl, setMeetUrl] = useState(meeting?.meetUrl ?? "");
  const [description, setDescription] = useState(meeting?.description ?? "");
  const [projectId, setProjectId] = useState(meeting?.project?.id ?? "");
  const [everyone, setEveryone] = useState(meeting ? meeting.everyone : isLead);
  const [picked, setPicked] = useState<Set<string>>(new Set(meeting && !meeting.everyone ? meeting.attendees.map((a) => a.id).filter((id) => id !== currentUserId) : []));
  const [announce, setAnnounce] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => setEveryone((e) => (isLead ? e : false)), [isLead]);

  const startsAt = (() => {
    const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const t = time.match(/^(\d{2}):(\d{2})$/);
    return m && t ? zonedToUtc(Number(m[1]), Number(m[2]), Number(m[3]), Number(t[1]), Number(t[2]), tz) : null;
  })();
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ready = !!title.trim() && !!startsAt && (everyone || picked.size > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    const body = { title, startsAt: startsAt!.toISOString(), durationMin: duration, meetUrl: meetUrl.trim(), description, projectId: projectId || null, everyone, userIds: [...picked] };
    const res = meeting ? await api<MeetingDTO>(`/api/meetings/${meeting.id}`, "PATCH", body) : await api<MeetingDTO>("/api/meetings", "POST", { ...body, announce });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    onSaved(res.data);
  }

  return (
    <Modal open onClose={onClose} title={meeting ? "Editar reunión" : "Nueva reunión"} width="max-w-lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-ink-soft" htmlFor="reu-titulo">Tema</label>
          <input id="reu-titulo" className="field w-full" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ej. Planificación del sprint" data-autofocus />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-3 space-y-1 sm:col-span-1">
            <label className="text-xs font-semibold text-ink-soft" htmlFor="reu-fecha">Fecha</label>
            <input id="reu-fecha" type="date" className="field w-full" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-ink-soft" htmlFor="reu-hora">Hora</label>
            <input id="reu-hora" type="time" className="field w-full" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-ink-soft" htmlFor="reu-dur">Dura</label>
            <select id="reu-dur" className="field w-full" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {[15, 30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : m === 60 ? "1 hora" : m % 60 ? `${m / 60} h` : `${m / 60} horas`}</option>)}
              {![15, 30, 45, 60, 90, 120, 180].includes(duration) && <option value={duration}>{duration} min</option>}
            </select>
          </div>
        </div>
        <p className="-mt-2 text-[11px] text-ink-faint">{startsAt ? `${formatDay(startsAt, tz)} · hora de ${zoneName(tz)} (${offsetLabel(startsAt, tz)}). Cada persona la verá en su hora.` : "Elige fecha y hora."}</p>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-ink-soft" htmlFor="reu-meet">Enlace de Meet (opcional)</label>
          <input id="reu-meet" className="field w-full" maxLength={300} value={meetUrl} onChange={(e) => setMeetUrl(e.target.value)} placeholder="https://meet.google.com/…" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-ink-soft" htmlFor="reu-proy">Proyecto (opcional)</label>
            <select id="reu-proy" className="field w-full" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Sin proyecto</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.key ? `${p.key} · ` : ""}{p.name}</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-ink-soft" htmlFor="reu-desc">Descripción (opcional)</label>
          <textarea id="reu-desc" className="field min-h-[4rem] w-full" maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-ink-soft">Invitados</p>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Invitados">
            {isLead && (
              <button type="button" role="radio" aria-checked={everyone} onClick={() => setEveryone(true)} className={cn("rounded-lg border p-2.5 text-left text-sm font-bold transition-colors", everyone ? "border-rust bg-chip-tint text-ink" : "border-line text-ink-soft hover:border-line-strong")}>Todo el equipo</button>
            )}
            <button type="button" role="radio" aria-checked={!everyone} onClick={() => setEveryone(false)} className={cn("rounded-lg border p-2.5 text-left text-sm font-bold transition-colors", !isLead && "col-span-2", !everyone ? "border-rust bg-chip-tint text-ink" : "border-line text-ink-soft hover:border-line-strong")}>Personas elegidas</button>
          </div>
          {!everyone && (
            <ul className="max-h-40 divide-y divide-line overflow-y-auto rounded-lg border border-line">
              {people.filter((p) => p.id !== currentUserId).map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-card-2">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--rust)]" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
                    <Avatar name={p.name} userId={p.id} size={22} />
                    <span className="min-w-0 flex-1 truncate text-ink">{p.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        {!meeting && (
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" className="accent-[var(--rust)]" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} />
            Anunciarla en el canal Reuniones del chat
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
          <button className="btn-primary btn-sm" disabled={!ready || busy}>{busy ? "Guardando…" : meeting ? "Guardar cambios" : "Agendar y avisar"}</button>
        </div>
      </form>
    </Modal>
  );
}
