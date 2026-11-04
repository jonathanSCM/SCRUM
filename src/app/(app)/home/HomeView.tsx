"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { daysRemaining } from "@/lib/scrum/sprintLifecycle";
import { cn, formatDate, timeAgo } from "@/lib/ui";
import Avatar from "@/components/ui/Avatar";
import { AnimatedNumber, ProgressBar, staggerChild, staggerParent } from "@/components/ui/Motion";
import { useOpenIssue } from "@/components/issue/useOpenIssue";

type Props = {
  userName: string;
  kpis: { projects: number; activeSprints: number; open: number; overdue: number; doneWeek: number };
  sprints: Array<{ id: string; name: string; projectId: string; projectName: string; projectKey: string; endDate: string | null; done: number; total: number; percent: number }>;
  overdue: Array<{ id: string; key: string; title: string; projectId: string; dueDate: string; assignee: string | null }>;
  workload: Array<{ name: string; count: number; points: number }>;
  activity: Array<{ id: string; who: string; projectId: string; projectName: string; at: string; label: string; detail: string }>;
};

export default function HomeView({ userName, kpis, sprints, overdue, workload, activity }: Props) {
  const openIssue = useOpenIssue();
  const first = userName.split(" ")[0];
  const maxLoad = Math.max(1, ...workload.map((w) => w.count));

  const tiles = [
    { label: "Proyectos", value: kpis.projects, tone: "text-ink" },
    { label: "Sprints activos", value: kpis.activeSprints, tone: "text-moss-ink" },
    { label: "Tickets abiertos", value: kpis.open, tone: "text-ink" },
    { label: "Vencidos", value: kpis.overdue, tone: kpis.overdue > 0 ? "text-danger" : "text-ink" },
    { label: "Hechos esta semana", value: kpis.doneWeek, tone: "text-moss-ink" },
  ];

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 pb-16 pt-8 sm:px-6">
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">Hola{first ? `, ${first}` : ""}</h1>
      <p className="mb-6 text-sm text-ink-soft">Así está el portafolio hoy.</p>

      <motion.div variants={staggerParent} initial="hidden" animate="show" className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map((t) => (
          <motion.div key={t.label} variants={staggerChild} className="lift border border-line bg-card p-4 rounded-lg">
            <p className="text-xs font-semibold text-ink-faint">{t.label}</p>
            <p className={cn("font-display text-4xl font-black", t.tone)}>
              <AnimatedNumber value={t.value} />
            </p>
          </motion.div>
        ))}
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 font-display text-lg font-extrabold text-ink">Sprints activos</h2>
            {sprints.length === 0 ? (
              <p className="border border-dashed border-line-strong p-5 text-sm text-ink-faint rounded-md">No hay sprints en curso. Iniciá uno desde el backlog de un proyecto.</p>
            ) : (
              <motion.ul variants={staggerParent} initial="hidden" animate="show" className="space-y-3">
                {sprints.map((s) => {
                  const left = daysRemaining(s.endDate ? new Date(s.endDate) : null);
                  return (
                    <motion.li key={s.id} variants={staggerChild}>
                      <Link href={`/projects/${s.projectId}/board`} className="lift block border border-line bg-card p-4 rounded-lg">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-moss-ink">{s.projectKey}</span>
                          <span className="font-display font-extrabold text-ink">{s.projectName}</span>
                          <span className="text-sm text-ink-soft">· {s.name}</span>
                          {left !== null && (
                            <span className={cn("lozenge ml-auto", left < 0 ? "text-danger" : left <= 2 ? "text-warn" : "text-moss-ink")}>
                              {left < 0 ? "vencido" : left === 0 ? "termina hoy" : `${left} d`}
                            </span>
                          )}
                        </div>
                        <div className="mt-3">
                          <ProgressBar value={s.percent} height={10} />
                          <p className="mt-1 flex justify-between font-mono text-[11px] text-ink-faint">
                            <span>{s.done}/{s.total} tickets</span>
                            <span>{s.percent}%</span>
                          </p>
                        </div>
                      </Link>
                    </motion.li>
                  );
                })}
              </motion.ul>
            )}
          </section>

          <section>
            <h2 className="mb-2 font-display text-lg font-extrabold text-ink">Vencidos</h2>
            {overdue.length === 0 ? (
              <p className="border border-dashed border-line-strong p-5 text-sm text-ink-faint rounded-md">Nada vencido.</p>
            ) : (
              <ul className="border border-line bg-card rounded-lg">
                {overdue.map((t) => (
                  <li key={t.id}>
                    <button onClick={() => openIssue(t.key)} className="flex w-full items-center gap-3 border-b border-line-strong px-3 py-2 text-left last:border-b-0 hover:bg-card-2">
                      <span className="w-16 shrink-0 font-mono text-xs text-ink-faint">{t.key}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{t.title}</span>
                      <span className="text-xs font-semibold text-danger">{formatDate(t.dueDate)}</span>
                      <Avatar name={t.assignee} size={20} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section>
            <h2 className="mb-2 font-display text-lg font-extrabold text-ink">Carga por persona</h2>
            {workload.length === 0 ? (
              <p className="border border-dashed border-line-strong p-5 text-sm text-ink-faint rounded-md">Sin tickets asignados.</p>
            ) : (
              <ul className="space-y-2 border border-line bg-card p-4 rounded-lg">
                {workload.map((w) => (
                  <li key={w.name} className="flex items-center gap-3 text-sm">
                    <Avatar name={w.name} size={22} />
                    <span className="w-28 truncate text-ink">{w.name}</span>
                    <div className="h-3 flex-1 border border-line bg-paper-deep rounded-lg">
                      <motion.div className="h-full bg-accent" initial={{ width: 0 }} animate={{ width: `${(w.count / maxLoad) * 100}%` }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} />
                    </div>
                    <span className="w-16 text-right font-mono text-xs text-ink-faint">{w.count}{w.points ? ` · ${w.points}p` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-2 font-display text-lg font-extrabold text-ink">Actividad reciente</h2>
            {activity.length === 0 ? (
              <p className="border border-dashed border-line-strong p-5 text-sm text-ink-faint rounded-md">Todavía no pasó nada.</p>
            ) : (
              <ul className="border border-line bg-card rounded-lg">
                {activity.map((a) => (
                  <li key={a.id} className="flex gap-3 border-b border-line-strong px-3 py-2.5 last:border-b-0">
                    <Avatar name={a.who} size={22} />
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="text-ink"><b>{a.who}</b> <span className="text-ink-soft">· {a.label}</span></p>
                      <p className="truncate text-ink-faint">
                        <Link href={`/projects/${a.projectId}/activity`} className="hover:text-moss-ink">{a.projectName}</Link>
                        {a.detail ? ` — ${a.detail}` : ""}
                      </p>
                    </div>
                    <time className="shrink-0 text-[11px] text-ink-faint">{timeAgo(a.at)}</time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
