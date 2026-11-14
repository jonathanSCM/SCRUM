"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/ui";
import { useTimezone } from "@/components/TimezoneProvider";
import { useToast } from "@/components/ui/Toaster";
import { dayKey, formatDay, formatTime, zonedToUtc } from "@/lib/scrum/countries";
import type { MeetingDTO } from "@/lib/meetings";
import MeetingDetail from "./MeetingDetail";
import MeetingForm from "./MeetingForm";

type Person = { id: string; name: string };
type Project = { id: string; name: string; key: string | null };
type View = "month" | "week" | "list";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// "YYYY-MM-DD" ↔ {y,m,d}; los días del calendario se manejan como texto en la zona de quien mira.
const parse = (k: string) => ({ y: Number(k.slice(0, 4)), m: Number(k.slice(5, 7)), d: Number(k.slice(8, 10)) });
const fmt = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const addDays = (k: string, n: number) => {
  const { y, m, d } = parse(k);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
};
const mondayOf = (k: string) => {
  const { y, m, d } = parse(k);
  const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // lunes = 0
  return addDays(k, -wd);
};
const dayStartUtc = (k: string, tz: string) => {
  const { y, m, d } = parse(k);
  return zonedToUtc(y, m, d, 0, 0, tz);
};
const monthTitle = (k: string) => {
  const { y, m } = parse(k);
  const s = new Intl.DateTimeFormat("es", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export default function CalendarView({ currentUserId, isLead, people, projects, openId }: { currentUserId: string; isLead: boolean; people: Person[]; projects: Project[]; openId: string | null }) {
  const { tz, chosen } = useTimezone();
  const toast = useToast();
  const router = useRouter();
  const today = dayKey(new Date(), tz);
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(today);
  const [selected, setSelected] = useState(today);
  const [meetings, setMeetings] = useState<MeetingDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<string | null>(openId);
  const [form, setForm] = useState<{ meeting: MeetingDTO | null; day: string } | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem("calendar-view");
      if (v === "month" || v === "week" || v === "list") setView(v);
      else if (window.innerWidth < 640) setView("list");
    } catch {}
  }, []);
  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem("calendar-view", v);
    } catch {}
  };

  // Rango visible (en la zona de quien mira, convertido a UTC para pedirlo al servidor).
  const range = useMemo(() => {
    if (view === "month") {
      const { y, m } = parse(cursor);
      const start = mondayOf(fmt(y, m, 1));
      return { start, days: 42 };
    }
    if (view === "week") return { start: mondayOf(cursor), days: 7 };
    return { start: cursor, days: 45 };
  }, [view, cursor]);

  const load = useCallback(async () => {
    const from = dayStartUtc(range.start, tz).toISOString();
    const to = dayStartUtc(addDays(range.start, range.days), tz).toISOString();
    const res = await api<{ meetings: MeetingDTO[] }>(`/api/meetings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    if (res.ok) setMeetings(res.data.meetings);
    setLoading(false);
  }, [range, tz]);
  useEffect(() => {
    setLoading(true);
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  // Enlace directo a una reunión (?reunion=…): se salta a su fecha.
  useEffect(() => {
    if (!openId) return;
    void api<MeetingDTO>(`/api/meetings/${openId}`).then((r) => {
      if (r.ok) {
        const k = dayKey(r.data.startsAt, tz);
        setCursor(k);
        setSelected(k);
      }
    });
  }, [openId, tz]);

  const byDay = useMemo(() => {
    const map = new Map<string, MeetingDTO[]>();
    for (const m of meetings) {
      const k = dayKey(m.startsAt, tz);
      map.set(k, [...(map.get(k) ?? []), m]);
    }
    return map;
  }, [meetings, tz]);

  function step(dir: -1 | 1) {
    const { y, m, d } = parse(cursor);
    if (view === "month") {
      const t = new Date(Date.UTC(y, m - 1 + dir, 1));
      setCursor(fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, 1));
    } else setCursor(addDays(fmt(y, m, d), (view === "week" ? 7 : 30) * dir));
  }
  const title = view === "month" ? monthTitle(cursor) : view === "week" ? `${formatDay(dayStartUtc(range.start, tz), tz, { day: "numeric", month: "short" })} – ${formatDay(dayStartUtc(addDays(range.start, 6), tz), tz, { day: "numeric", month: "short", year: "numeric" })}` : "Próximas reuniones";

  const chip = (m: MeetingDTO) => (
    <button key={m.id} onClick={() => setDetail(m.id)} title={`${formatTime(m.startsAt, tz)} · ${m.title}`} className={cn("flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-semibold transition-colors", m.status === "CANCELED" ? "bg-card-2 text-ink-faint line-through" : new Date(m.endsAt) < new Date() ? "bg-card-2 text-ink-soft hover:bg-chip-tint" : "bg-chip-tint text-rust hover:brightness-95")}>
      <span className="font-mono text-[10px] opacity-80">{formatTime(m.startsAt, tz)}</span>
      <span className="truncate">{m.title}</span>
    </button>
  );

  const card = (m: MeetingDTO) => (
    <button key={m.id} onClick={() => setDetail(m.id)} className={cn("flex w-full items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-rust", m.status === "CANCELED" ? "border-line opacity-60" : "border-line-strong")}>
      <span className="w-14 shrink-0 text-center">
        <span className="block font-mono text-sm font-bold text-ink">{formatTime(m.startsAt, tz)}</span>
        <span className="block font-mono text-[10px] text-ink-faint">{formatTime(m.endsAt, tz)}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm font-bold text-ink", m.status === "CANCELED" && "line-through")}>{m.title}</span>
        <span className="block truncate text-xs text-ink-soft">{m.createdBy ? `Agendó ${m.createdBy.name}` : "Reunión"}{m.project ? ` · ${m.project.key ?? m.project.name}` : ""}{m.recordings > 0 ? ` · ${m.recordings} grabación${m.recordings === 1 ? "" : "es"}` : ""}</span>
      </span>
      {m.status === "CANCELED" ? <span className="lozenge text-danger">Cancelada</span> : new Date(m.endsAt) < new Date() ? <span className="lozenge text-ink-soft">Realizada</span> : null}
    </button>
  );

  const dayMeetings = (k: string) => byDay.get(k) ?? [];

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-8 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">Calendario</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-line" role="group" aria-label="Vista">
            {([["month", "Mes"], ["week", "Semana"], ["list", "Lista"]] as const).map(([v, l]) => (
              <button key={v} onClick={() => changeView(v)} aria-pressed={view === v} className={cn("px-3 py-1 text-xs font-bold", view === v ? "bg-rust text-white" : "text-ink-soft hover:text-ink")}>{l}</button>
            ))}
          </div>
          <a href={SITE.extensionUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm" title="Instala la extensión para grabar y transcribir tus reuniones de Meet">Extensión de Meet ↗</a>
          <button className="btn-primary btn-sm" onClick={() => setForm({ meeting: null, day: selected })}>+ Nueva reunión</button>
        </div>
      </div>

      {!chosen && (
        <p className="mb-4 rounded-lg border border-line-strong bg-card-2/60 px-4 py-2.5 text-sm text-ink-soft">
          Las horas se muestran en la zona de tu navegador ({tz.replace(/_/g, " ")}). <Link href="/settings/profile" className="font-semibold text-rust hover:underline">Elige tu país</Link> para verlas siempre en tu hora.
        </p>
      )}

      <div className="mb-3 flex items-center gap-2">
        <button className="btn-ghost btn-sm" onClick={() => step(-1)} aria-label="Anterior">←</button>
        <button className="btn-ghost btn-sm" onClick={() => { setCursor(today); setSelected(today); }}>Hoy</button>
        <button className="btn-ghost btn-sm" onClick={() => step(1)} aria-label="Siguiente">→</button>
        <h2 className="ml-2 font-display text-lg font-extrabold text-ink">{title}</h2>
        {loading && <span className="text-xs text-ink-faint">Cargando…</span>}
      </div>

      {view === "month" && (
        <>
          <div className="overflow-hidden rounded-xl border border-line-strong bg-card">
            <div className="grid grid-cols-7 border-b border-line-strong bg-card-2/60 text-center text-[11px] font-bold uppercase tracking-wide text-ink-faint">
              {WEEKDAYS.map((d) => <div key={d} className="py-2">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: 42 }, (_, i) => {
                const k = addDays(range.start, i);
                const inMonth = parse(k).m === parse(cursor).m;
                const list = dayMeetings(k);
                return (
                  <div key={k} onClick={() => setSelected(k)} className={cn("min-h-[5.5rem] cursor-pointer border-b border-r border-line p-1 sm:min-h-[7.5rem] sm:p-1.5", !inMonth && "bg-card-2/40", k === selected && "bg-chip-tint/50")}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold", k === today ? "bg-rust text-white" : inMonth ? "text-ink" : "text-ink-faint")}>{parse(k).d}</span>
                      <button className="hidden h-5 w-5 rounded text-ink-faint hover:bg-card-2 hover:text-rust sm:block" onClick={(e) => { e.stopPropagation(); setForm({ meeting: null, day: k }); }} aria-label={`Agendar el ${k}`}>+</button>
                    </div>
                    <div className="hidden space-y-0.5 sm:block">
                      {list.slice(0, 3).map((m) => chip(m))}
                      {list.length > 3 && <button className="px-1 text-[11px] font-semibold text-ink-soft hover:text-rust" onClick={(e) => { e.stopPropagation(); setSelected(k); }}>+{list.length - 3} más</button>}
                    </div>
                    {list.length > 0 && <div className="flex gap-0.5 sm:hidden">{list.slice(0, 4).map((m) => <span key={m.id} className="h-1.5 w-1.5 rounded-full bg-rust" />)}</div>}
                  </div>
                );
              })}
            </div>
          </div>
          <section className="mt-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="font-display text-base font-extrabold text-ink">{formatDay(dayStartUtc(selected, tz), tz)}{selected === today ? " · hoy" : ""}</h3>
              <button className="btn-ghost btn-sm ml-auto" onClick={() => setForm({ meeting: null, day: selected })}>{selected < today ? "+ Registrar una reunión de este día" : "+ Agendar en este día"}</button>
            </div>
            {dayMeetings(selected).length === 0 ? <p className="rounded-lg border border-dashed border-line-strong p-4 text-sm text-ink-faint">No hay reuniones este día.</p> : <div className="space-y-2">{dayMeetings(selected).map(card)}</div>}
          </section>
        </>
      )}

      {view === "week" && (
        <div className="grid gap-3 md:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => {
            const k = addDays(range.start, i);
            return (
              <section key={k} className={cn("rounded-xl border bg-card p-2", k === today ? "border-rust" : "border-line-strong")}>
                <h3 className="mb-2 flex items-center justify-between px-1 text-xs font-bold uppercase tracking-wide text-ink-faint">
                  <span className={k === today ? "text-rust" : ""}>{WEEKDAYS[i]} {parse(k).d}</span>
                  <button className="text-base leading-none text-ink-faint hover:text-rust" onClick={() => setForm({ meeting: null, day: k })} aria-label={`Agendar el ${k}`}>+</button>
                </h3>
                <div className="space-y-1.5">
                  {dayMeetings(k).map((m) => (
                    <button key={m.id} onClick={() => setDetail(m.id)} className={cn("w-full rounded-lg border-l-4 bg-card-2 p-2 text-left hover:brightness-95", m.status === "CANCELED" ? "border-line opacity-60" : "border-rust")}>
                      <span className="block font-mono text-[11px] font-bold text-ink-soft">{formatTime(m.startsAt, tz)}–{formatTime(m.endsAt, tz)}</span>
                      <span className={cn("block text-xs font-bold text-ink", m.status === "CANCELED" && "line-through")}>{m.title}</span>
                    </button>
                  ))}
                  {dayMeetings(k).length === 0 && <p className="px-1 py-3 text-center text-[11px] text-ink-faint">—</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {view === "list" && (
        <div className="space-y-5">
          {Array.from({ length: range.days }, (_, i) => addDays(range.start, i)).filter((k) => dayMeetings(k).length > 0).map((k) => (
            <section key={k}>
              <h3 className="mb-2 font-display text-sm font-extrabold text-ink">{formatDay(dayStartUtc(k, tz), tz)}{k === today ? " · hoy" : ""}</h3>
              <div className="space-y-2">{dayMeetings(k).map(card)}</div>
            </section>
          ))}
          {!loading && meetings.length === 0 && <p className="rounded-lg border border-dashed border-line-strong p-6 text-center text-sm text-ink-faint">No hay reuniones en estos días. Agenda una con «+ Nueva reunión» o con <span className="font-mono">/reunion</span> en el chat.</p>}
        </div>
      )}

      {detail && (
        <MeetingDetail
          id={detail}
          currentUserId={currentUserId}
          isLead={isLead}
          onClose={() => { setDetail(null); if (openId) router.replace("/calendar"); }}
          onEdit={(m) => { setDetail(null); setForm({ meeting: m, day: dayKey(m.startsAt, tz) }); }}
          onChanged={() => void load()}
        />
      )}
      {form && <MeetingForm meeting={form.meeting} day={form.day} isLead={isLead} currentUserId={currentUserId} people={people} projects={projects} onClose={() => setForm(null)} onSaved={(m) => { setForm(null); toast.success(form.meeting ? "Reunión actualizada" : "Reunión agendada"); void load(); setDetail(m.id); }} />}
    </main>
  );
}
