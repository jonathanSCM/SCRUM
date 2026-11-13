"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { cn } from "@/lib/ui";
import { localDateString, missingStandups, shiftDate } from "@/lib/scrum/ceremonies";
import Avatar from "@/components/ui/Avatar";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toaster";

type StandupEntry = { id: string; date: string; yesterday: string; today: string; blockers: string; help: string; user: { id: string; name: string } };
type Form = { yesterday: string; today: string; blockers: string; help: string };
type Suggestion = { yesterday: string; today: string; blockers: string };

const EMPTY: Form = { yesterday: "", today: "", blockers: "", help: "" };
const FIELDS: Array<[keyof Form, string]> = [
  ["yesterday", "¿Qué hice ayer?"],
  ["today", "¿Qué voy a hacer hoy?"],
  ["blockers", "¿Algo me bloquea?"],
  ["help", "¿En qué te puedo ayudar?"],
];

export default function DailyView({ currentUserId }: { currentUserId: string }) {
  const toast = useToast();
  const [date, setDate] = useState(localDateString());
  const [entries, setEntries] = useState<StandupEntry[] | null>(null);
  const [members, setMembers] = useState<Array<{ id: string; name: string }>>([]);
  const [suggestion, setSuggestion] = useState<Suggestion>({ yesterday: "", today: "", blockers: "" });
  const [form, setForm] = useState<Form>(EMPTY);
  const [suggested, setSuggested] = useState(false); // el borrador viene del autocompletado y todavía no se guardó
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{ entries: StandupEntry[]; members: Array<{ id: string; name: string }>; suggestion: Suggestion }>(`/api/daily?date=${date}`);
    if (!res.ok) return toast.error(res.error);
    setEntries(res.data.entries);
    setMembers(res.data.members);
    setSuggestion(res.data.suggestion);
    const mine = res.data.entries.find((e) => e.user.id === currentUserId);
    if (mine) {
      setForm({ yesterday: mine.yesterday, today: mine.today, blockers: mine.blockers, help: mine.help });
      setSuggested(false);
    } else {
      // Todavía no lo dejó: se arma el borrador con su trabajo en tickets (puede editarlo antes de guardar).
      const s = res.data.suggestion;
      setForm({ ...EMPTY, yesterday: s.yesterday, today: s.today, blockers: s.blockers });
      setSuggested(!!(s.yesterday || s.today || s.blockers));
    }
  }, [date, currentUserId, toast]);

  useEffect(() => {
    setEntries(null);
    load();
  }, [load]);

  function autofill() {
    setForm((f) => ({ ...f, yesterday: suggestion.yesterday || f.yesterday, today: suggestion.today || f.today, blockers: suggestion.blockers || f.blockers }));
    setSuggested(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await api("/api/daily", "POST", { date, ...form });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Daily guardado");
    load();
  }

  const hasSuggestion = !!(suggestion.yesterday || suggestion.today || suggestion.blockers);
  const missing = entries ? missingStandups(members, entries.map((x) => x.user.id)) : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <form onSubmit={save} className="space-y-3 self-start rounded-lg border border-line bg-card p-4">
        <div className="flex items-center gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={() => setDate(shiftDate(date, -1))} aria-label="Día anterior">←</button>
          <input type="date" className="field-sm min-w-0 flex-1" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <button type="button" className="btn-ghost btn-sm" onClick={() => setDate(shiftDate(date, 1))} aria-label="Día siguiente">→</button>
        </div>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-base font-extrabold text-ink">Mi daily</h2>
          {hasSuggestion && (
            <button type="button" className="btn-ghost btn-sm ml-auto" onClick={autofill} title="Rellena ayer, hoy y bloqueos con tus tickets">
              Autocompletar
            </button>
          )}
        </div>
        {suggested && <p className="rounded-md bg-card-2 px-2 py-1.5 text-xs text-ink-soft">Borrador armado con tus tickets. Edítalo y guárdalo.</p>}
        {FIELDS.map(([key, label]) => (
          <div key={key}>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">{label}</label>
            <textarea className="field" rows={key === "help" ? 2 : 3} maxLength={2000} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
          </div>
        ))}
        <button className="btn-primary w-full" disabled={saving}>{saving ? "Guardando…" : "Guardar mi daily"}</button>
      </form>

      <div className="space-y-3">
        {entries === null ? (
          <div className="skeleton h-32 w-full" />
        ) : entries.length === 0 ? (
          <EmptyState title="Nadie dejó su daily este día" hint="El daily es asíncrono: cada persona lo completa cuando puede. Todo el equipo ve las respuestas acá." />
        ) : (
          entries.map((en) => (
            <article key={en.id} className="rounded-lg border border-line bg-card">
              <header className="flex items-center gap-2 border-b border-line-strong bg-card-2 px-3 py-2">
                <Avatar name={en.user.name} userId={en.user.id} size={22} />
                <b className="text-sm text-ink">{en.user.name}</b>
              </header>
              <dl className="grid gap-x-4 gap-y-2 px-3 py-3 text-sm sm:grid-cols-2">
                {FIELDS.map(([key, label]) =>
                  en[key] ? (
                    <div key={key} className={key === "blockers" ? "sm:col-span-2" : ""}>
                      <dt className={cn("text-xs font-semibold", key === "blockers" ? "text-warn" : "text-ink-faint")}>{label}</dt>
                      <dd className="whitespace-pre-wrap break-words text-ink-soft">{en[key]}</dd>
                    </div>
                  ) : null
                )}
              </dl>
            </article>
          ))
        )}
        {entries && missing.length > 0 && <p className="text-xs text-ink-faint">Todavía no lo dejaron: {missing.join(", ")}.</p>}
      </div>
    </div>
  );
}
