"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { DndContext, DragOverlay, PointerSensor, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { api } from "@/lib/client";
import { cn, pct } from "@/lib/ui";
import { daysRemaining } from "@/lib/scrum/sprintLifecycle";
import { suggestProjectKey } from "@/lib/scrum/issueKey";
import Avatar from "@/components/ui/Avatar";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import { DragIcon, PlusIcon } from "@/components/ui/Icons";
import { useDragScroll } from "@/lib/useDragScroll";
import { ProgressBar, staggerChild, staggerParent } from "@/components/ui/Motion";
import { useToast } from "@/components/ui/Toaster";

export type ProjectCardData = {
  id: string;
  key: string;
  name: string;
  statusId: string;
  lead: string | null;
  activeSprint: { name: string; endDate: string | null } | null;
  done: number;
  total: number;
};
type Status = { id: string; name: string; color: string };

export default function ProjectsView({ projects, statuses }: { projects: ProjectCardData[]; statuses: Status[] }) {
  const router = useRouter();
  const toast = useToast();
  const [view, setView] = useState<"board" | "table">("board");
  const [items, setItems] = useState(projects);
  const [dragId, setDragId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => setItems(projects), [projects]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("projects-view");
      if (saved === "table" || saved === "board") setView(saved);
    } catch {}
  }, []);
  function changeView(v: "board" | "table") {
    setView(v);
    try {
      localStorage.setItem("projects-view", v);
    } catch {}
  }

  const panRef = useDragScroll<HTMLDivElement>();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((p) => `${p.key} ${p.name}`.toLowerCase().includes(q)) : items;
  }, [items, query]);
  const dragged = dragId ? items.find((p) => p.id === dragId) : null;

  async function onDragEnd(e: DragEndEvent) {
    setDragId(null);
    const statusId = e.over ? String(e.over.id) : null;
    const id = String(e.active.id);
    const project = items.find((p) => p.id === id);
    if (!statusId || !project || project.statusId === statusId) return;
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, statusId } : p)));
    const res = await api(`/api/projects/${id}`, "PATCH", { statusId });
    if (!res.ok) {
      toast.error(res.error);
      setItems(projects);
    }
    router.refresh();
  }

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 pb-16 pt-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">Proyectos</h1>
        <input className="field-sm w-full sm:ml-4 sm:w-60" placeholder="Buscar proyecto…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar proyecto" />
        <div className="ml-auto flex items-center gap-2">
          <div className="flex border border-line rounded-md" role="group" aria-label="Vista">
            {(["board", "table"] as const).map((v) => (
              <button key={v} onClick={() => changeView(v)} aria-pressed={view === v} className={cn("px-3 py-1 text-xs font-bold", view === v ? "bg-rust text-white" : "text-ink-soft hover:text-ink")}>
                {v === "board" ? "Tablero" : "Tabla"}
              </button>
            ))}
          </div>
          <Link href="/projects/import" className="btn-ghost btn-sm">Importar con IA</Link>
          <button className="btn-primary btn-sm" onClick={() => setCreating(true)}>
            <PlusIcon size={14} /> Nuevo proyecto
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState title="Todavía no hay proyectos" hint="Creá el primero: va a tener su propia clave (por ejemplo PRO-1), backlog y sprints." action={<button className="btn-primary btn-sm" onClick={() => setCreating(true)}>Crear proyecto</button>} />
      ) : view === "board" ? (
        <DndContext sensors={sensors} collisionDetection={(args) => { const hit = pointerWithin(args); return hit.length ? hit : rectIntersection(args); }} onDragStart={(e) => setDragId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
          <div ref={panRef} className="flex min-h-[60vh] cursor-grab gap-3 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {statuses.map((s) => (
              <StatusColumn key={s.id} status={s} projects={filtered.filter((p) => p.statusId === s.id)} />
            ))}
          </div>
          <DragOverlay dropAnimation={{ duration: 160 }}>{dragged ? <ProjectCard project={dragged} overlay /> : null}</DragOverlay>
        </DndContext>
      ) : (
        <ProjectTable projects={filtered} statuses={statuses} />
      )}

      <NewProjectModal open={creating} onClose={() => setCreating(false)} takenKeys={items.map((p) => p.key)} />
    </main>
  );
}

function StatusColumn({ status, projects }: { status: Status; projects: ProjectCardData[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id });
  return (
    <div ref={setNodeRef} className={cn("min-h-[220px] w-72 shrink-0 border bg-card-2/40 transition-colors rounded-md", isOver ? "border-moss bg-card-2" : "border-line-strong")}>
      <div className="flex items-center gap-2 border-b border-line-strong px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: status.color }} />
        <span className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">{status.name}</span>
        <span className="font-mono text-xs text-ink-faint">{projects.length}</span>
      </div>
      <motion.div variants={staggerParent} initial="hidden" animate="show" className="space-y-2 p-2">
        {projects.map((p) => (
          <DraggableCard key={p.id} project={p} />
        ))}
        {projects.length === 0 && <p className="py-6 text-center text-xs text-ink-faint">Soltá un proyecto acá</p>}
      </motion.div>
    </div>
  );
}

function DraggableCard({ project }: { project: ProjectCardData }) {
  // Solo el cuadradito arrastra el proyecto a otra fase; el resto de la tarjeta abre el proyecto.
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: project.id });
  return (
    <motion.div variants={staggerChild} ref={setNodeRef} className={cn("relative", isDragging && "opacity-30")}>
      <ProjectCard project={project} />
      <button
        ref={setActivatorNodeRef}
        type="button"
        data-no-pan
        {...attributes}
        {...listeners}
        title="Arrastrar para cambiar de fase"
        aria-label={`Mover ${project.name} a otra fase`}
        className="absolute right-2 top-2 flex h-6 w-6 cursor-grab touch-none items-center justify-center rounded-md border border-line-strong bg-paper text-ink-faint transition-colors hover:border-rust hover:text-rust active:cursor-grabbing"
      >
        <DragIcon size={14} />
      </button>
    </motion.div>
  );
}

function ProjectCard({ project, overlay }: { project: ProjectCardData; overlay?: boolean }) {
  const percent = pct(project.done, project.total);
  const left = project.activeSprint ? daysRemaining(project.activeSprint.endDate ? new Date(project.activeSprint.endDate) : null) : null;
  return (
    <Link
      href={`/projects/${project.id}/board`}
      draggable={false}
      className={cn("lift block border border-line bg-card p-3 rounded-lg", overlay && "rotate-2 border-moss shadow-hard-purple")}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] font-bold text-moss-ink">{project.key}</span>
        <Avatar name={project.lead} size={20} />
      </div>
      <p className="mt-1 font-display text-base font-extrabold leading-tight text-ink">{project.name}</p>
      <div className="mt-3">
        <ProgressBar value={percent} height={8} />
        <p className="mt-1 flex justify-between font-mono text-[11px] text-ink-faint">
          <span>{project.done}/{project.total} tickets</span>
          <span>{percent}%</span>
        </p>
      </div>
      {project.activeSprint && (
        <p className="mt-2 text-xs text-ink-soft">
          <span className="lozenge text-moss-ink">{project.activeSprint.name}</span>
          {left !== null ? <span className="ml-2 text-ink-faint">{left < 0 ? "vencido" : `${left} d`}</span> : null}
        </p>
      )}
    </Link>
  );
}

function ProjectTable({ projects, statuses }: { projects: ProjectCardData[]; statuses: Status[] }) {
  const byId = new Map(statuses.map((s) => [s.id, s]));
  return (
    <div className="overflow-x-auto border border-line bg-card rounded-lg">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-line bg-card-2 text-xs uppercase tracking-wide text-ink-faint">
          <tr>
            <th className="px-3 py-2">Clave</th>
            <th className="px-3 py-2">Proyecto</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2">Encargado</th>
            <th className="px-3 py-2">Sprint</th>
            <th className="px-3 py-2 text-right">Progreso</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id} className="border-b border-line-strong last:border-b-0 hover:bg-card-2">
              <td className="px-3 py-2 font-mono text-xs text-moss-ink">{p.key}</td>
              <td className="px-3 py-2 font-semibold"><Link href={`/projects/${p.id}/board`} className="text-ink hover:underline">{p.name}</Link></td>
              <td className="px-3 py-2"><span className="lozenge" style={{ color: `color-mix(in srgb, ${byId.get(p.statusId)?.color ?? "#6f6a88"} 55%, var(--ink))` }}>{byId.get(p.statusId)?.name}</span></td>
              <td className="px-3 py-2 text-ink-soft">{p.lead ?? "—"}</td>
              <td className="px-3 py-2 text-ink-soft">{p.activeSprint?.name ?? "—"}</td>
              <td className="px-3 py-2 text-right font-mono text-xs">{p.done}/{p.total} · {pct(p.done, p.total)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NewProjectModal({ open, onClose, takenKeys }: { open: boolean; onClose: () => void; takenKeys: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const suggested = useMemo(() => (name.trim() ? suggestProjectKey(name, takenKeys) : ""), [name, takenKeys]);
  const effectiveKey = keyTouched ? key : suggested;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await api<{ id: string }>("/api/projects", "POST", { name, key: effectiveKey || undefined, description: description || undefined });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Proyecto creado");
    onClose();
    setName("");
    setKey("");
    setKeyTouched(false);
    setDescription("");
    router.push(`/projects/${res.data.id}/backlog`);
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo proyecto"
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" form="new-project-form" className="btn-primary" disabled={saving || !name.trim()}>{saving ? "Creando…" : "Crear proyecto"}</button>
        </>
      }
    >
      <form id="new-project-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Nombre *</label>
            <input data-autofocus className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Clave</label>
            <input
              className="field font-mono uppercase"
              value={effectiveKey}
              onChange={(e) => {
                setKeyTouched(true);
                setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5));
              }}
              maxLength={5}
            />
          </div>
        </div>
        {effectiveKey && <p className="text-xs text-ink-faint">Los tickets se van a llamar <span className="font-mono text-ink">{effectiveKey}-1</span>, <span className="font-mono text-ink">{effectiveKey}-2</span>…</p>}
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Descripción</label>
          <textarea className="field" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}
