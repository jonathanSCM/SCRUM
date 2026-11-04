"use client";

import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import type { BurndownResult } from "@/lib/scrum/burndown";
import type { VelocityResult } from "@/lib/scrum/velocity";
import type { IssueCardData, SprintData } from "@/lib/types";
import { SPRINT_STATE_META, type SprintState } from "@/lib/scrum/constants";
import { formatDate } from "@/lib/ui";
import { IssueRowView } from "@/components/issue/IssueViews";
import { useOpenIssue } from "@/components/issue/useOpenIssue";
import { AnimatedNumber } from "@/components/ui/Motion";

export default function ReportsView({
  projectId,
  sprints,
  selected,
  burndown,
  velocity,
  done,
  notDone,
}: {
  projectId: string;
  sprints: Array<{ id: string; name: string; state: SprintState }>;
  selected: SprintData;
  burndown: BurndownResult;
  velocity: VelocityResult;
  done: IssueCardData[];
  notDone: IssueCardData[];
}) {
  const router = useRouter();
  const openIssue = useOpenIssue();
  const unit = burndown.unit === "points" ? "pts" : "tickets";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold text-ink-soft" htmlFor="sprint-select">Sprint</label>
        <select id="sprint-select" className="field-sm" value={selected.id} onChange={(e) => router.push(`/projects/${projectId}/reports?sprint=${e.target.value}`)}>
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>{s.name} · {SPRINT_STATE_META[s.state].label}</option>
          ))}
        </select>
        <span className="text-xs text-ink-faint">{formatDate(selected.startDate ?? selected.startedAt)} – {formatDate(selected.endDate)}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Comprometido" value={burndown.committed} unit={unit} />
        <Stat label="Alcance agregado" value={burndown.scopeAdded} unit={unit} />
        <Stat label="Completado" value={burndown.completed} unit={unit} accent />
        <Stat label="Velocidad promedio" value={velocity.average} unit={velocity.unit === "points" ? "pts" : "tickets"} />
      </div>

      <section className="border border-line bg-card p-4 rounded-lg overflow-hidden">
        <h2 className="mb-1 font-display text-lg font-extrabold text-ink">Burndown</h2>
        <p className="mb-3 text-xs text-ink-faint">Trabajo restante ({unit}) por día contra la línea ideal. Solo cuenta los tickets que hoy pertenecen al sprint.</p>
        <BurndownChart data={burndown} />
      </section>

      <section className="border border-line bg-card p-4 rounded-lg overflow-hidden">
        <h2 className="mb-1 font-display text-lg font-extrabold text-ink">Velocidad</h2>
        <p className="mb-3 text-xs text-ink-faint">Comprometido vs. completado en los últimos sprints cerrados.</p>
        <VelocityChart data={velocity} />
      </section>

      <section className="border border-line bg-card rounded-lg overflow-hidden">
        <h2 className="border-b border-line px-4 py-3 font-display text-lg font-extrabold text-ink">Reporte del sprint</h2>
        <div className="grid gap-0 lg:grid-cols-2">
          <div className="lg:border-r lg:border-line-strong">
            <h3 className="border-b border-line-strong bg-card-2 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-moss-ink">Completado · {done.length}</h3>
            {done.length === 0 ? <p className="px-4 py-4 text-xs text-ink-faint">Nada completado todavía.</p> : done.map((i) => <IssueRowView key={i.id} issue={i} onOpen={() => openIssue(i.key)} />)}
          </div>
          <div>
            <h3 className="border-b border-line-strong bg-card-2 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-warn">
              {selected.state === "COMPLETED" ? "No completado" : "Pendiente"} · {notDone.length}
            </h3>
            {notDone.length === 0 ? (
              <p className="px-4 py-4 text-xs text-ink-faint">{selected.state === "COMPLETED" ? "Los tickets sin terminar se movieron al backlog o al siguiente sprint al cerrar." : "No queda nada pendiente."}</p>
            ) : (
              notDone.map((i) => <IssueRowView key={i.id} issue={i} onOpen={() => openIssue(i.key)} />)
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, unit, accent }: { label: string; value: number; unit: string; accent?: boolean }) {
  return (
    <div className={`border p-3 ${accent ? "border-moss" : "border-line-strong"} bg-card`}>
      <p className="text-xs font-semibold text-ink-faint">{label}</p>
      <p className={`font-display text-3xl font-extrabold ${accent ? "text-moss-ink" : "text-ink"}`}>
        <AnimatedNumber value={value} />
        <span className="ml-1 text-xs font-medium text-ink-faint">{unit}</span>
      </p>
    </div>
  );
}

const W = 720;
const H = 260;
const PAD = { l: 40, r: 16, t: 14, b: 34 };

function BurndownChart({ data }: { data: BurndownResult }) {
  const pts = data.points;
  const maxY = Math.max(1, ...pts.map((p) => Math.max(p.ideal, p.remaining ?? 0)));
  const x = (i: number) => PAD.l + (i / Math.max(1, pts.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / maxY) * (H - PAD.t - PAD.b);

  const ideal = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.ideal)}`).join(" ");
  const real = pts.filter((p) => p.remaining !== null);
  const realPath = real.map((p, i) => `${i === 0 ? "M" : "L"}${x(pts.indexOf(p))},${y(p.remaining as number)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxY * t));
  const labelEvery = Math.ceil(pts.length / 8);

  if (data.committed === 0 && data.scopeAdded === 0) {
    return <p className="py-8 text-center text-sm text-ink-faint">Este sprint no tiene tickets, no hay nada que graficar.</p>;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Gráfico burndown">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
          <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--ink-faint)" fontFamily="var(--font-mono)">{t}</text>
        </g>
      ))}
      {pts.map((p, i) =>
        i % labelEvery === 0 || i === pts.length - 1 ? (
          <text key={p.label + i} x={x(i)} y={H - 10} textAnchor="middle" fontSize={10} fill="var(--ink-faint)" fontFamily="var(--font-mono)">
            {p.label === "inicio" ? "inicio" : p.label.slice(5)}
          </text>
        ) : null
      )}
      <path d={ideal} fill="none" stroke="var(--ink-faint)" strokeWidth={2} strokeDasharray="6 5" />
      <motion.path d={realPath} fill="none" stroke="var(--moss)" strokeWidth={3.5} strokeLinejoin="miter" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }} />
      {real.map((p) => (
        <rect key={p.label} x={x(pts.indexOf(p)) - 4} y={y(p.remaining as number) - 4} width={8} height={8} fill="var(--moss)" stroke="var(--paper)" strokeWidth={2}>
          <title>{`${p.label}: ${p.remaining} restantes (ideal ${p.ideal})`}</title>
        </rect>
      ))}
      <g fontSize={11} fontFamily="var(--font-body)">
        <rect x={W - 190} y={6} width={10} height={10} fill="var(--moss)" />
        <text x={W - 175} y={15} fill="var(--ink-soft)">Real</text>
        <line x1={W - 130} x2={W - 112} y1={11} y2={11} stroke="var(--ink-faint)" strokeWidth={2} strokeDasharray="4 3" />
        <text x={W - 106} y={15} fill="var(--ink-soft)">Ideal</text>
      </g>
    </svg>
  );
}

function VelocityChart({ data }: { data: VelocityResult }) {
  if (data.bars.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-faint">Cuando completes tu primer sprint vas a ver su velocidad acá.</p>;
  }
  const max = Math.max(1, ...data.bars.flatMap((b) => [b.committed, b.completed]));
  const barW = Math.min(36, (W - PAD.l - PAD.r) / data.bars.length / 2.6);
  const slot = (W - PAD.l - PAD.r) / data.bars.length;
  const h = (v: number) => (v / max) * (H - PAD.t - PAD.b);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Gráfico de velocidad">
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="var(--line-strong)" strokeWidth={2} />
        {data.bars.map((b, i) => {
          const cx = PAD.l + slot * i + slot / 2;
          return (
            <g key={b.id}>
              <motion.rect x={cx - barW - 2} width={barW} fill="var(--ink-faint)" initial={{ y: H - PAD.b, height: 0 }} animate={{ y: H - PAD.b - h(b.committed), height: h(b.committed) }} transition={{ duration: 0.7, delay: i * 0.06 }}>
                <title>{`${b.name}: comprometido ${b.committed}`}</title>
              </motion.rect>
              <motion.rect x={cx + 2} width={barW} fill="var(--moss)" initial={{ y: H - PAD.b, height: 0 }} animate={{ y: H - PAD.b - h(b.completed), height: h(b.completed) }} transition={{ duration: 0.7, delay: i * 0.06 + 0.1 }}>
                <title>{`${b.name}: completado ${b.completed}`}</title>
              </motion.rect>
              <text x={cx} y={H - 14} textAnchor="middle" fontSize={10} fill="var(--ink-faint)" fontFamily="var(--font-mono)">{b.name.length > 10 ? `${b.name.slice(0, 9)}…` : b.name}</text>
            </g>
          );
        })}
        <g fontSize={11}>
          <rect x={PAD.l} y={4} width={10} height={10} fill="var(--ink-faint)" />
          <text x={PAD.l + 15} y={13} fill="var(--ink-soft)">Comprometido</text>
          <rect x={PAD.l + 105} y={4} width={10} height={10} fill="var(--moss)" />
          <text x={PAD.l + 120} y={13} fill="var(--ink-soft)">Completado</text>
        </g>
      </svg>
      <p className="mt-1 text-xs text-ink-faint">Promedio: <b className="text-ink">{data.average}</b> {data.unit === "points" ? "pts" : "tickets"} por sprint.</p>
    </div>
  );
}
