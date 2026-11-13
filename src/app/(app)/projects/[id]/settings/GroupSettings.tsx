"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/ui/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";

type Person = { id: string; name: string };
type Props = {
  canManage: boolean;
  people: Person[]; // el equipo, sin quien creó el grupo
  group: { id: string; name: string; isPrivate: boolean; archived: boolean; converted: boolean; accessIds: string[] };
};

export default function GroupSettings({ canManage, people, group }: Props) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState(group.name);
  const [isPrivate, setIsPrivate] = useState(group.isPrivate);
  const [access, setAccess] = useState<string[]>(group.accessIds);
  const [projectName, setProjectName] = useState(group.name);
  const [busy, setBusy] = useState("");

  if (!canManage) return <p className="rounded-lg border border-dashed border-line-strong p-5 text-sm text-ink-faint">Solo quien creó el grupo o un líder del equipo puede cambiar sus ajustes.</p>;

  async function saveBasics(e: React.FormEvent) {
    e.preventDefault();
    setBusy("basics");
    const res = await api(`/api/groups/${group.id}`, "PATCH", { name, isPrivate });
    if (res.ok && isPrivate) {
      const acc = await api(`/api/groups/${group.id}/access`, "PUT", { userIds: access });
      if (!acc.ok) { setBusy(""); return toast.error(acc.error); }
    }
    setBusy("");
    if (!res.ok) return toast.error(res.error);
    toast.success("Cambios guardados");
    router.refresh();
  }

  async function archive(archived: boolean) {
    setBusy("archive");
    const res = await api(`/api/groups/${group.id}`, "PATCH", { archived });
    setBusy("");
    if (!res.ok) return toast.error(res.error);
    toast.success(archived ? "Grupo archivado" : "Grupo restaurado");
    router.push(archived ? "/groups" : `/projects/${group.id}/board`);
    router.refresh();
  }

  async function convert() {
    const warn = group.isPrivate ? " El proyecto será visible para todo el equipo (los grupos privados se vuelven públicos al convertirse)." : "";
    if (!(await confirm(`¿Convertir este grupo en el proyecto «${projectName}»? Las tareas pasan al proyecto con sus comentarios y adjuntos, y el grupo queda archivado.${warn}`, { confirmLabel: "Convertir en proyecto" }))) return;
    setBusy("convert");
    const res = await api<{ id: string; moved: number }>(`/api/groups/${group.id}/convert`, "POST", { name: projectName });
    setBusy("");
    if (!res.ok) return toast.error(res.error);
    toast.success(`Proyecto creado con ${res.data.moved} ${res.data.moved === 1 ? "tarea" : "tareas"}`);
    router.push(`/projects/${res.data.id}/board`);
    router.refresh();
  }

  async function remove() {
    if (!(await confirm(`¿Borrar el grupo «${group.name}» con todas sus tareas? No se puede deshacer.`, { confirmLabel: "Borrar", danger: true }))) return;
    setBusy("delete");
    const res = await api(`/api/groups/${group.id}`, "DELETE");
    setBusy("");
    if (!res.ok) return toast.error(res.error);
    toast.success("Grupo borrado");
    router.push("/groups");
    router.refresh();
  }

  const toggle = (id: string) => setAccess((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {!group.converted && (
        <form onSubmit={saveBasics} className="space-y-4 rounded-lg border border-line bg-card p-4">
          <h2 className="font-display text-lg font-extrabold text-ink">General</h2>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Nombre del grupo</label>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-semibold text-ink-soft">¿Quién lo ve?</legend>
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="radio" name="vis" className="mt-1" checked={!isPrivate} onChange={() => setIsPrivate(false)} />
              <span><b>Todo el equipo</b><span className="block text-xs text-ink-faint">Cualquiera del equipo ve y mueve las tareas.</span></span>
            </label>
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="radio" name="vis" className="mt-1" checked={isPrivate} onChange={() => setIsPrivate(true)} />
              <span><b>Privado</b><span className="block text-xs text-ink-faint">Solo quien lo creó y las personas que elijas. Nadie más lo ve ni lo encuentra (tampoco en el buscador ni en el chat).</span></span>
            </label>
          </fieldset>
          {isPrivate && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-soft">Personas con acceso</label>
              {people.length === 0 ? (
                <p className="text-xs text-ink-faint">No hay más personas en el equipo.</p>
              ) : (
                <ul className="grid gap-1 sm:grid-cols-2">
                  {people.map((p) => (
                    <li key={p.id}>
                      <label className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-sm text-ink">
                        <input type="checkbox" checked={access.includes(p.id)} onChange={() => toggle(p.id)} />
                        {p.name}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <button className="btn-primary" disabled={busy === "basics"}>{busy === "basics" ? "Guardando…" : "Guardar cambios"}</button>
        </form>
      )}

      {!group.converted && !group.archived && (
        <section className="space-y-3 rounded-lg border border-line bg-card p-4">
          <h2 className="font-display text-lg font-extrabold text-ink">Convertir en proyecto</h2>
          <p className="text-sm text-ink-soft">Crea un proyecto con las tareas de este grupo (con sus comentarios, adjuntos y responsables). El grupo queda archivado y apunta al proyecto nuevo.</p>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Nombre del proyecto</label>
            <input className="field" value={projectName} onChange={(e) => setProjectName(e.target.value)} maxLength={200} />
          </div>
          <button className="btn-mint" onClick={convert} disabled={busy === "convert" || !projectName.trim()}>{busy === "convert" ? "Convirtiendo…" : "Convertir en proyecto"}</button>
        </section>
      )}

      {!group.converted && (
        <section className="space-y-3 rounded-lg border border-line bg-card p-4">
          <h2 className="font-display text-lg font-extrabold text-ink">{group.archived ? "Restaurar" : "Archivar"}</h2>
          <p className="text-sm text-ink-soft">{group.archived ? "El grupo vuelve a la lista y se puede editar de nuevo." : "Sale de la lista principal pero no se pierde nada: se puede restaurar cuando quieras."}</p>
          <button className="btn-ghost" onClick={() => archive(!group.archived)} disabled={busy === "archive"}>{group.archived ? "Restaurar grupo" : "Archivar grupo"}</button>
        </section>
      )}

      <section className="space-y-3 rounded-lg border border-danger/40 bg-card p-4">
        <h2 className="font-display text-lg font-extrabold text-danger">Borrar el grupo</h2>
        <p className="text-sm text-ink-soft">Se borran todas sus tareas. Si quieres conservarlas, conviértelo en proyecto o archívalo.</p>
        <button className="btn-ghost text-danger" onClick={remove} disabled={busy === "delete"}>Borrar grupo</button>
      </section>
    </div>
  );
}
