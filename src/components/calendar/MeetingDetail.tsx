"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "@/components/ui/Modal";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/client";
import { useToast } from "@/components/ui/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";
import { useTimezone } from "@/components/TimezoneProvider";
import { formatDay, formatTime, offsetLabel, offsetMinutes, zoneName } from "@/lib/scrum/countries";
import type { MeetingDTO } from "@/lib/meetings";
import Recordings from "./Recordings";
import MeetingFiles from "./MeetingFiles";

// Detalle de una reunión: quién la agendó, la hora en tu zona y en la de cada invitado, el enlace y las grabaciones.
export default function MeetingDetail({ id, currentUserId, isLead, onClose, onEdit, onChanged }: { id: string; currentUserId: string; isLead: boolean; onClose: () => void; onEdit: (m: MeetingDTO) => void; onChanged: () => void }) {
  const { tz } = useTimezone();
  const toast = useToast();
  const confirm = useConfirm();
  const [m, setM] = useState<MeetingDTO | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const res = await api<MeetingDTO>(`/api/meetings/${id}`);
    if (res.ok) setM(res.data);
    else setMissing(true);
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  // Invitados agrupados por zona horaria: "10:00 Perú · 11:00 Bolivia".
  const zones = useMemo(() => {
    if (!m) return [];
    const g = new Map<string, string[]>();
    for (const a of m.attendees) g.set(a.tz, [...(g.get(a.tz) ?? []), a.name]);
    return [...g.entries()].sort((a, b) => offsetMinutes(new Date(m.startsAt), a[0]) - offsetMinutes(new Date(m.startsAt), b[0]));
  }, [m]);

  const canEdit = !!m && (m.createdBy?.id === currentUserId || isLead);
  async function setCanceled(canceled: boolean) {
    if (!m) return;
    if (canceled && !(await confirm(`¿Cancelar «${m.title}»? Se avisa a los invitados.`, { confirmLabel: "Cancelar reunión", danger: true }))) return;
    const res = await api<MeetingDTO>(`/api/meetings/${m.id}`, "PATCH", { canceled });
    if (!res.ok) return toast.error(res.error);
    setM(res.data);
    onChanged();
  }
  async function remove() {
    if (!m || !(await confirm(`¿Borrar «${m.title}» del calendario? También se borran sus grabaciones y transcripciones.`, { confirmLabel: "Borrar", danger: true }))) return;
    const res = await api(`/api/meetings/${m.id}`, "DELETE");
    if (!res.ok) return toast.error(res.error);
    onChanged();
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={m ? m.title : "Reunión"} width="max-w-xl">
      {missing ? (
        <p className="text-sm text-ink-faint">Esta reunión ya no existe.</p>
      ) : !m ? (
        <div className="skeleton h-32 w-full" />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            {m.status === "CANCELED" && <span className="lozenge text-danger">Cancelada</span>}
            {m.status !== "CANCELED" && new Date(m.endsAt) < new Date() && <span className="lozenge text-moss-ink">Realizada</span>}
            {m.project && <span className="lozenge text-ink-soft">{m.project.key ?? m.project.name}</span>}
          </div>
          <div>
            <p className="font-display text-lg font-extrabold text-ink">{formatDay(m.startsAt, tz)}</p>
            <p className="text-sm text-ink-soft">
              <b className="text-ink">{formatTime(m.startsAt, tz)}</b> a <b className="text-ink">{formatTime(m.endsAt, tz)}</b> · hora de {zoneName(tz)} ({offsetLabel(m.startsAt, tz)})
            </p>
            {m.createdBy && <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-faint"><Avatar name={m.createdBy.name} userId={m.createdBy.id} size={18} /> Agendada por <b className="text-ink-soft">{m.createdBy.name}</b></p>}
          </div>

          {m.meetUrl && (
            <a href={m.meetUrl} target="_blank" rel="noopener noreferrer nofollow" className="btn-primary inline-flex">Unirme a la reunión</a>
          )}
          {m.description && (
            <section>
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-faint">Notas de la reunión</h3>
              <p className="whitespace-pre-wrap text-sm text-ink-soft">{m.description}</p>
            </section>
          )}
          <MeetingFiles meetingId={m.id} />

          <section>
            <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-faint">Hora para cada persona</h3>
            <ul className="space-y-1.5">
              {zones.map(([zone, names]) => (
                <li key={zone} className="flex items-start gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                  <span className="w-28 shrink-0 font-mono font-bold text-ink">{formatTime(m.startsAt, zone)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">{zoneName(zone)} <span className="font-normal text-ink-faint">({offsetLabel(m.startsAt, zone)})</span></span>
                    <span className="block truncate text-xs text-ink-soft">{names.join(", ")}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] text-ink-faint">{m.everyone ? "Invitado todo el equipo." : `${m.attendees.length} invitados.`}</p>
          </section>

          <Recordings meetingId={m.id} onChanged={() => { void load(); onChanged(); }} />

          {canEdit && (
            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              <button className="btn-ghost btn-sm" onClick={() => onEdit(m)}>Editar</button>
              {m.status === "CANCELED" ? <button className="btn-ghost btn-sm" onClick={() => setCanceled(false)}>Reactivar</button> : <button className="btn-ghost btn-sm text-danger" onClick={() => setCanceled(true)}>Cancelar reunión</button>}
              <button className="ml-auto text-xs text-ink-faint hover:text-danger" onClick={remove}>Borrar</button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

