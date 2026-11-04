"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/client";
import type { SprintData } from "@/lib/types";
import { durationToEnd } from "@/lib/scrum/sprintLifecycle";

function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(dateInput: string, days: number): string {
  const d = new Date(`${dateInput}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---- Iniciar sprint ----

export function StartSprintModal({
  open,
  onClose,
  projectId,
  sprint,
  issueCount,
  points,
  isLead,
  notReady,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  sprint: Pick<SprintData, "id" | "name" | "goal" | "startDate" | "endDate">;
  issueCount: number;
  points: number;
  isLead: boolean;
  notReady: Array<{ key: string; title: string; missing: string[] }>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(sprint.name);
  const [goal, setGoal] = useState(sprint.goal);
  const [weeks, setWeeks] = useState("2");
  const [start, setStart] = useState(sprint.startDate?.slice(0, 10) ?? todayInput());
  const [end, setEnd] = useState(sprint.endDate?.slice(0, 10) ?? addDays(todayInput(), 13));
  const [saving, setSaving] = useState(false);
  const [force, setForce] = useState(false);
  const blocked = notReady.length > 0 && !force;

  useEffect(() => {
    if (open) {
      setForce(false);
      setName(sprint.name);
      setGoal(sprint.goal);
      const s = sprint.startDate?.slice(0, 10) ?? todayInput();
      setStart(s);
      setEnd(sprint.endDate?.slice(0, 10) ?? addDays(s, 13));
      setWeeks("2");
    }
  }, [open, sprint]);

  function applyWeeks(value: string, startValue = start) {
    setWeeks(value);
    if (value !== "custom") {
      const weeksNum = Number(value);
      const endDate = durationToEnd(new Date(`${startValue}T00:00:00Z`), weeksNum);
      endDate.setUTCDate(endDate.getUTCDate() - 1);
      setEnd(endDate.toISOString().slice(0, 10));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await api(`/api/sprints/${sprint.id}/start`, "POST", {
      name,
      goal,
      startDate: `${start}T00:00:00.000Z`,
      endDate: `${end}T23:59:59.000Z`,
      ...(force ? { force: true } : {}),
    });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`${name} arrancó`);
    onClose();
    router.push(`/projects/${projectId}/board`);
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Iniciar sprint"
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" form="start-sprint-form" className="btn-mint" disabled={saving || blocked}>
            {saving ? "Iniciando…" : "Iniciar sprint"}
          </button>
        </>
      }
    >
      <form id="start-sprint-form" onSubmit={submit} className="space-y-4">
        <p className="text-sm text-ink-soft">
          Se compromete a <b className="text-ink">{issueCount} {issueCount === 1 ? "ticket" : "tickets"}</b>
          {points > 0 ? <> · <b className="font-mono text-ink">{points} pts</b></> : null}.
        </p>
        {notReady.length > 0 && (
          <div className="space-y-2 border border-warn bg-card-2 p-3 text-sm rounded-lg">
            <p className="font-semibold text-ink">
              Falta información en {notReady.length} {notReady.length === 1 ? "ticket" : "tickets"} (Definition of Ready)
            </p>
            <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-ink-soft">
              {notReady.map((t) => (
                <li key={t.key}>
                  <span className="font-mono text-ink">{t.key}</span> {t.title} — <span className="text-warn">falta: {t.missing.join(", ")}</span>
                </li>
              ))}
            </ul>
            {isLead ? (
              <label className="flex items-center gap-2 text-xs text-ink">
                <input type="checkbox" className="h-4 w-4 accent-moss" checked={force} onChange={(e) => setForce(e.target.checked)} />
                Iniciar de todas formas (queda registrado)
              </label>
            ) : (
              <p className="text-xs text-ink-faint">Completá el checklist de cada ticket, o pedile a un líder que fuerce el inicio.</p>
            )}
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Nombre del sprint</label>
          <input data-autofocus className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Objetivo (opcional)</label>
          <textarea className="field" rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="¿Qué queremos lograr en este sprint?" maxLength={500} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Duración</label>
            <select className="field" value={weeks} onChange={(e) => applyWeeks(e.target.value)}>
              <option value="1">1 semana</option>
              <option value="2">2 semanas</option>
              <option value="3">3 semanas</option>
              <option value="4">4 semanas</option>
              <option value="custom">Personalizada</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Inicio</label>
            <input
              type="date"
              className="field"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                if (weeks !== "custom") applyWeeks(weeks, e.target.value);
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Fin</label>
            <input
              type="date"
              className="field"
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
                setWeeks("custom");
              }}
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ---- Completar sprint ----

export function CompleteSprintModal({
  open,
  onClose,
  sprint,
  doneCount,
  openCount,
  donePoints,
  plannedSprints,
}: {
  open: boolean;
  onClose: () => void;
  sprint: Pick<SprintData, "id" | "name">;
  doneCount: number;
  openCount: number;
  donePoints: number;
  plannedSprints: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [destination, setDestination] = useState("BACKLOG");
  const [saving, setSaving] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    if (open) setDestination("BACKLOG");
  }, [open]);

  async function submit() {
    setSaving(true);
    const res = await api(`/api/sprints/${sprint.id}/complete`, "POST", { destination });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`${sprint.name} completado`);
    if (doneCount > 0) {
      setCelebrating(true);
      setTimeout(() => {
        setCelebrating(false);
        onClose();
        router.refresh();
      }, 1100);
    } else {
      onClose();
      router.refresh();
    }
  }

  return (
    <>
      <Modal
        open={open && !celebrating}
        onClose={onClose}
        title={`Completar ${sprint.name}`}
        footer={
          <>
            <button className="btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn-mint" disabled={saving} onClick={submit}>
              {saving ? "Completando…" : "Completar sprint"}
            </button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-moss p-3 rounded-md">
              <p className="font-display text-2xl font-extrabold text-moss-ink">{doneCount}</p>
              <p className="text-xs text-ink-soft">tickets completados{donePoints > 0 ? ` · ${donePoints} pts` : ""}</p>
            </div>
            <div className="border border-line-strong p-3 rounded-md">
              <p className="font-display text-2xl font-extrabold text-ink">{openCount}</p>
              <p className="text-xs text-ink-soft">sin terminar</p>
            </div>
          </div>
          {openCount > 0 && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-soft">¿Qué hacemos con los tickets sin terminar?</label>
              <select className="field" value={destination} onChange={(e) => setDestination(e.target.value)}>
                <option value="BACKLOG">Devolverlos al backlog</option>
                {plannedSprints.map((s) => (
                  <option key={s.id} value={s.id}>Pasarlos a {s.name}</option>
                ))}
              </select>
            </div>
          )}
          <p className="text-xs text-ink-faint">Los tickets completados quedan registrados en este sprint para los reportes.</p>
        </div>
      </Modal>
      <Burst show={celebrating} />
    </>
  );
}

// Explosión corta de cuadrados al cerrar un sprint con trabajo hecho.
function Burst({ show }: { show: boolean }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => {
        const angle = (i / 28) * Math.PI * 2 + (i % 3) * 0.2;
        const distance = 140 + ((i * 53) % 160);
        return { i, x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, color: ["#2fe3a6", "#8b5cf6", "#8b5cf6", "#ffb020", "#60a5fa"][i % 5], size: 8 + (i % 4) * 4, rot: (i * 47) % 180 };
      }),
    []
  );
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="pointer-events-none fixed inset-0 z-[95] flex items-center justify-center" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
          {pieces.map((p) => (
            <motion.span
              key={p.i}
              className="absolute border border-line rounded-md"
              style={{ width: p.size, height: p.size, background: p.color }}
              initial={{ x: 0, y: 0, scale: 0.4, rotate: 0, opacity: 1 }}
              animate={{ x: p.x, y: p.y, scale: 1, rotate: p.rot, opacity: [1, 1, 0] }}
              transition={{ duration: 1, ease: [0.1, 0.8, 0.3, 1] }}
            />
          ))}
          <motion.p
            className="border border-line bg-moss px-5 py-3 font-display text-2xl font-black text-[#150b22] rounded-md"
            initial={{ scale: 0.4, rotate: -6, opacity: 0 }}
            animate={{ scale: 1, rotate: -3, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 14 }}
            style={{ boxShadow: "6px 6px 0 var(--rust)" }}
          >
            ¡Sprint cerrado!
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
