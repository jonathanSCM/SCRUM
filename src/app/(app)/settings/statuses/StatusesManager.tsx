"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/ui/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";
import { PlusIcon, TrashIcon } from "@/components/ui/Icons";

type Item = { id: string; name: string; color: string; projects: number };

export default function StatusesManager({ initial }: { initial: Item[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState(initial);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#8b5cf6");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const res = await api<{ id: string; name: string; color: string }>("/api/statuses", "POST", { name: newName, color: newColor });
    if (!res.ok) return toast.error(res.error);
    setItems([...items, { ...res.data, projects: 0 }]);
    setNewName("");
    toast.success("Estado creado");
    router.refresh();
  }

  async function save(item: Item) {
    const res = await api(`/api/statuses/${item.id}`, "PATCH", { name: item.name, color: item.color });
    if (!res.ok) return toast.error(res.error);
    toast.success("Guardado");
    router.refresh();
  }

  async function remove(item: Item) {
    const ok = await confirm(`¿Eliminar el estado «${item.name}»?`, { confirmLabel: "Eliminar", danger: true });
    if (!ok) return;
    const res = await api(`/api/statuses/${item.id}`, "DELETE");
    if (!res.ok) return toast.error(res.error);
    setItems(items.filter((i) => i.id !== item.id));
    toast.success("Estado eliminado");
    router.refresh();
  }

  function patch(id: string, change: Partial<Item>) {
    setItems(items.map((i) => (i.id === id ? { ...i, ...change } : i)));
  }

  return (
    <div className="space-y-4">
      <ul className="border-2 border-ink bg-card">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 border-b-2 border-line-strong px-3 py-2.5 last:border-b-0">
            <input type="color" aria-label="Color" className="h-8 w-8 cursor-pointer border-2 border-ink bg-transparent p-0" value={item.color} onChange={(e) => patch(item.id, { color: e.target.value })} onBlur={() => save(item)} />
            <input className="field-sm min-w-0 flex-1" value={item.name} onChange={(e) => patch(item.id, { name: e.target.value })} onBlur={() => save(item)} maxLength={60} />
            <span className="w-20 text-right text-xs text-ink-faint">{item.projects} {item.projects === 1 ? "proyecto" : "proyectos"}</span>
            <button className="text-ink-faint hover:text-danger" aria-label={`Eliminar ${item.name}`} onClick={() => remove(item)}>
              <TrashIcon size={16} />
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={add} className="flex items-center gap-2 border-2 border-dashed border-line-strong p-3">
        <input type="color" aria-label="Color" className="h-8 w-8 cursor-pointer border-2 border-ink bg-transparent p-0" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
        <input className="field-sm min-w-0 flex-1" placeholder="Nuevo estado…" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} />
        <button className="btn-primary btn-sm" disabled={!newName.trim()}>
          <PlusIcon size={14} /> Agregar
        </button>
      </form>
    </div>
  );
}
