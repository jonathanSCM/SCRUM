"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, useDroppable, useDraggable } from "@dnd-kit/core";

type Status = { id: string; name: string; color: string };
type Project = {
  id: string;
  name: string;
  description: string;
  assigneeName: string | null;
  statusId: string;
  _count: { tasks: number };
};

function ProjectCard({ project }: { project: Project }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: project.id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 10 } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border border-line bg-card p-3.5 rounded-xl2 backdrop-blur-md shadow-[0_20px_45px_-20px_rgba(0,0,0,0.7)] transition-shadow ${
        isDragging ? "opacity-80" : ""
      }`}
    >
      <div {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing">
        <Link
          href={`/projects/${project.id}`}
          onClick={(e) => e.stopPropagation()}
          className="font-display text-sm font-semibold text-ink hover:text-moss"
        >
          {project.name}
        </Link>
        {project.description && <p className="mt-1 line-clamp-2 text-xs text-ink-soft">{project.description}</p>}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-ink-faint">
        <span>{project.assigneeName ?? "Sin encargado"}</span>
        <span>{project._count.tasks} tareas</span>
      </div>
    </div>
  );
}

function Column({ status, projects }: { status: Status; projects: Project[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id });

  return (
    <div className="w-72 shrink-0">
      <div className="mb-3 flex items-center gap-2 border-b-2 pb-2" style={{ borderColor: status.color }}>
        <h2 className="font-display text-sm font-semibold text-ink">{status.name}</h2>
        <span className="text-xs text-ink-faint">{projects.length}</span>
      </div>
      <div ref={setNodeRef} className={`space-y-2.5 rounded-xl2 p-1 transition-colors ${isOver ? "bg-rust/10" : ""}`}>
        {projects.length === 0 ? (
          <div className="border border-dashed border-line-strong rounded-xl2 p-4 text-center text-xs text-ink-faint">
            Sin proyectos
          </div>
        ) : (
          projects.map((p) => <ProjectCard key={p.id} project={p} />)
        )}
      </div>
    </div>
  );
}

export default function ProjectsBoard({ statuses, projects }: { statuses: Status[]; projects: Project[] }) {
  const router = useRouter();
  const [items, setItems] = useState(projects);
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const newStatusId = over.id as string;
    const project = items.find((p) => p.id === active.id);
    if (!project || project.statusId === newStatusId) return;

    setError(null);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusId: newStatusId }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "No se pudo mover el proyecto");
      return;
    }

    setItems((prev) => prev.map((p) => (p.id === project.id ? { ...p, statusId: newStatusId } : p)));
    router.refresh();
  }

  return (
    <div>
      {error && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {statuses.map((status) => (
            <Column key={status.id} status={status} projects={items.filter((p) => p.statusId === status.id)} />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
