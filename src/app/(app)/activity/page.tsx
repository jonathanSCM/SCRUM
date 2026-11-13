import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/session";
import { getTeamActivity } from "@/lib/activity";
import { DEFAULT_TZ, formatDay, formatTime, isValidTimeZone, zoneName } from "@/lib/scrum/countries";
import { KINDS, KIND_META, hhmm, isMonday, mondayOf, shiftDay, type ActivityKind } from "@/lib/scrum/activity";
import Avatar from "@/components/ui/Avatar";

export const metadata = { title: "Actividad del equipo" };

const DAY_LABEL = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Actividad del equipo: solo la ve el dueño. Cuenta trabajo en proyectos, tickets, notas y dailys (no el chat).
export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ w?: string; u?: string }> }) {
  const { role, workspaceId, session } = await requireWorkspace();
  if (role !== "OWNER") redirect("/home");
  const { w, u } = await searchParams;

  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { timezone: true, notifPrefs: { select: { tz: true } } } });
  const tz = [me?.timezone, me?.notifPrefs?.tz].find((z): z is string => !!z && isValidTimeZone(z)) ?? DEFAULT_TZ;
  const thisMonday = mondayOf(new Date(), tz);
  const monday = w && isMonday(w) ? w : thisMonday;
  const { days, members, summary, timeline } = await getTeamActivity(workspaceId, monday, tz, u);

  const rows = members.map((m) => ({ m, a: summary.get(m.id)! })).sort((x, y) => y.a.total - x.a.total || x.m.name.localeCompare(y.m.name));
  const teamTotal = rows.reduce((n, r) => n + r.a.total, 0);
  const focus = rows.find((r) => r.m.id === u) ?? null;
  const qs = (o: { w?: string; u?: string | null }) => {
    const p = new URLSearchParams();
    const week = o.w ?? monday;
    if (week !== thisMonday) p.set("w", week);
    if (o.u) p.set("u", o.u);
    const s = p.toString();
    return `/activity${s ? `?${s}` : ""}`;
  };
  const dayName = (d: string) => formatDay(`${d}T12:00:00Z`, "UTC", { day: "numeric", month: "short" });
  const weekMax = Math.max(1, ...rows.flatMap((r) => r.a.byDay));
  const peak = (a: (typeof rows)[number]["a"]) => (a.peakHour == null ? "—" : `${String(a.peakHour).padStart(2, "0")}:00`);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6">
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">Actividad del equipo</h1>
      <p className="mb-5 max-w-3xl text-sm text-ink-soft">
        Qué hizo cada persona en el sistema esta semana y a qué hora: crear, mover, actualizar y comentar en proyectos, tickets, sprints y notas, más los dailys.
        No incluye el chat. Las horas son de {zoneName(tz)}. Esta vista solo la ve el dueño del equipo.
      </p>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={qs({ w: shiftDay(monday, -7), u })} className="btn-ghost btn-sm" aria-label="Semana anterior">←</Link>
        <b className="font-display text-base text-ink">{dayName(days[0])} – {dayName(days[6])}</b>
        <Link href={qs({ w: shiftDay(monday, 7), u })} className="btn-ghost btn-sm" aria-label="Semana siguiente">→</Link>
        {monday !== thisMonday && <Link href={qs({ w: thisMonday, u })} className="btn-ghost btn-sm">Esta semana</Link>}
        <span className="ml-auto font-mono text-xs text-ink-faint">{teamTotal} acciones en el equipo</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full min-w-[56rem] text-sm">
          <thead>
            <tr className="border-b border-line-strong bg-card-2 text-left text-xs font-semibold text-ink-soft">
              <th className="px-3 py-2">Persona</th>
              <th className="px-2 py-2 text-right">Acciones</th>
              <th className="px-2 py-2 text-right" title="Tickets que pasaron a Hecho">Terminó</th>
              {KINDS.filter((k) => k !== "DELETE").map((k) => (
                <th key={k} className="px-2 py-2 text-right">{KIND_META[k].label}</th>
              ))}
              <th className="px-2 py-2 text-right">Días</th>
              <th className="px-2 py-2 text-right" title="Hora con más actividad">Hora pico</th>
              <th className="px-3 py-2">Por día</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ m, a }) => (
              <tr key={m.id} className={`border-b border-line last:border-0 ${m.id === u ? "bg-card-2" : ""}`}>
                <td className="px-3 py-2">
                  <Link href={qs({ u: m.id === u ? null : m.id })} className="flex items-center gap-2 font-semibold text-ink hover:underline">
                    <Avatar name={m.name} userId={m.id} size={22} />
                    {m.name}
                  </Link>
                </td>
                <td className="px-2 py-2 text-right font-mono font-bold text-ink">{a.total}</td>
                <td className="px-2 py-2 text-right font-mono text-ink-soft">{a.completed}</td>
                {KINDS.filter((k) => k !== "DELETE").map((k: ActivityKind) => (
                  <td key={k} className="px-2 py-2 text-right font-mono text-ink-soft">{a.byKind[k]}</td>
                ))}
                <td className="px-2 py-2 text-right font-mono text-ink-soft">{a.activeDays}/7</td>
                <td className="px-2 py-2 text-right font-mono text-ink-soft">{peak(a)}</td>
                <td className="px-3 py-2">
                  <div className="flex h-6 items-end gap-0.5" aria-label={`Acciones por día: ${a.byDay.join(", ")}`}>
                    {a.byDay.map((n, i) => (
                      <span key={i} title={`${DAY_LABEL[i]} ${dayName(days[i])}: ${n}`} className="w-3 rounded-sm bg-[var(--c-progress)]" style={{ height: `${Math.max(n ? 12 : 3, (n / weekMax) * 100)}%`, opacity: n ? 1 : 0.2 }} />
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-faint">Una acción es un cambio hecho por una persona sobre un ticket (o proyecto) en un mismo minuto: guardar un ticket con varios campos cuenta una vez. Haz clic en una persona para ver sus horas y su detalle.</p>

      {focus ? (
        <section className="mt-8 space-y-6">
          <h2 className="flex items-center gap-2 font-display text-xl font-extrabold text-ink">
            <Avatar name={focus.m.name} userId={focus.m.id} size={28} />
            {focus.m.name}
            <span className="font-mono text-sm font-medium text-ink-faint">{focus.a.total} acciones · {focus.a.tasks} tickets · {focus.a.projects} proyectos</span>
          </h2>

          <div>
            <h3 className="mb-2 text-sm font-extrabold text-ink">A qué horas trabajó</h3>
            <div className="overflow-x-auto rounded-lg border border-line bg-card p-3">
              <div className="min-w-[44rem]">
                <div className="grid grid-cols-[5rem_1fr_7.5rem] items-center gap-2 text-[11px] text-ink-faint">
                  <span />
                  <div className="grid gap-px" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
                    {Array.from({ length: 24 }, (_, h) => (
                      <span key={h} className="text-center">{h % 3 === 0 ? h : ""}</span>
                    ))}
                  </div>
                  <span className="text-right">primera – última</span>
                </div>
                {days.map((d, i) => {
                  const fl = focus.a.firstLast[i];
                  const max = Math.max(1, ...focus.a.heat.flat());
                  return (
                    <div key={d} className="mt-1 grid grid-cols-[5rem_1fr_7.5rem] items-center gap-2">
                      <span className="text-xs font-semibold text-ink-soft">{DAY_LABEL[i]} {d.slice(8)}</span>
                      <div className="grid gap-px" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
                        {focus.a.heat[i].map((n, h) => (
                          <span key={h} title={`${DAY_LABEL[i]} ${String(h).padStart(2, "0")}:00 — ${n} ${n === 1 ? "acción" : "acciones"}`} className="h-5 rounded-[3px] border border-line" style={{ background: n ? `color-mix(in srgb, var(--c-progress) ${Math.round(20 + (n / max) * 80)}%, transparent)` : "transparent" }} />
                        ))}
                      </div>
                      <span className="text-right font-mono text-xs text-ink-soft">{fl ? `${hhmm(fl.first)} – ${hhmm(fl.last)}` : "—"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-extrabold text-ink">Detalle (lo más reciente primero)</h3>
            {timeline.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line-strong p-5 text-sm text-ink-faint">Sin actividad esta semana.</p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
                {timeline.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                    <span className="w-28 shrink-0 font-mono text-xs text-ink-faint">{formatDay(t.at, tz, { weekday: "short", day: "numeric" })} {formatTime(t.at, tz)}</span>
                    <span className="font-semibold text-ink">{t.label}</span>
                    {t.key && <span className="font-mono text-xs text-ink-faint">{t.key}</span>}
                    <span className="min-w-0 flex-1 truncate text-ink-soft">{t.detail}</span>
                    {t.project && <span className="text-xs text-ink-faint">{t.project}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : (
        <p className="mt-6 text-sm text-ink-faint">Selecciona a una persona para ver a qué horas trabajó cada día y qué hizo exactamente.</p>
      )}
    </main>
  );
}
