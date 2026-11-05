"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/ui/Avatar";
import { roleBadge } from "@/lib/scrum/roles";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/ui/Toaster";

type Person = { id: string; name: string; wsRole: "OWNER" | "ADMIN" | "MEMBER"; tagline: string | null; chatColor: string | null; open: number; doneWeek: number; email: string | null };

export default function PeopleDirectory({ people: initial, workspaceName, currentUserId, isLead }: { people: Person[]; workspaceName: string; currentUserId: string; isLead: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [people, setPeople] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"LEAD" | "MEMBER">("MEMBER");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => setPeople(initial), [initial]);

  const randomPassword = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const password = randomPassword();
    const res = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password, role }) });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return toast.error(body.error || "No se pudo crear la cuenta");
    }
    setCreated({ email, password });
    setName("");
    setEmail("");
    setRole("MEMBER");
    setShowForm(false);
    router.refresh();
  }

  async function removeUser(p: Person) {
    if (!(await confirm(`¿Borrar la cuenta de "${p.name}"?`, { confirmLabel: "Borrar", danger: true }))) return;
    const res = await fetch(`/api/users/${p.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return toast.error(body.error || "No se pudo borrar");
    }
    setPeople((prev) => prev.filter((x) => x.id !== p.id));
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {isLead && (
        <div className="space-y-3">
          {created && (
            <div className="rounded-lg border border-rust bg-card p-4 text-sm">
              <p className="font-semibold text-ink">Cuenta creada — pásale estos datos, no se van a volver a mostrar:</p>
              <p className="mt-1 text-ink-soft">Email: <span className="font-mono">{created.email}</span></p>
              <p className="text-ink-soft">Contraseña temporal: <span className="font-mono">{created.password}</span></p>
              <button onClick={() => setCreated(null)} className="mt-2 text-xs text-ink-faint hover:text-ink">Cerrar</button>
            </div>
          )}
          {showForm ? (
            <form onSubmit={addUser} className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-card p-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-ink-soft">Nombre</label>
                <input required value={name} onChange={(e) => setName(e.target.value)} className="field" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-ink-soft">Email</label>
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-ink-soft">Rol</label>
                <select value={role} onChange={(e) => setRole(e.target.value as "LEAD" | "MEMBER")} className="field">
                  <option value="MEMBER">Miembro</option>
                  <option value="LEAD">Líder</option>
                </select>
              </div>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? "Creando…" : "Crear cuenta"}</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">Cancelar</button>
            </form>
          ) : (
            <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">+ Nueva cuenta</button>
          )}
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {people.map((p) => (
          <li key={p.id} className="lift relative flex items-center gap-3 rounded-lg border border-line bg-card p-4">
            <Link href={`/people/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3" aria-label={`Perfil de ${p.name}`}>
              <Avatar name={p.name} userId={p.id} color={p.chatColor} size={48} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-base font-extrabold text-ink">
                  {p.name}
                  {p.id === currentUserId && <span className="ml-1.5 text-xs font-medium text-ink-faint">(vos)</span>}
                </p>
                <p className="truncate text-xs text-ink-soft">{p.tagline}</p>
                <p className="mt-0.5"><span className={`lozenge ${p.wsRole === "OWNER" ? "text-rust" : "text-ink-soft"}`}>{roleBadge(p.wsRole, workspaceName)}</span></p>
                {isLead && p.email && <p className="truncate font-mono text-[11px] text-ink-faint">{p.email}</p>}
                <p className="mt-1 font-mono text-[11px] text-ink-faint">{p.open} abiertos · {p.doneWeek} terminados esta semana</p>
              </div>
            </Link>
            {isLead && p.id !== currentUserId && (
              <button onClick={() => removeUser(p)} className="absolute right-2 top-2 text-xs text-ink-faint hover:text-danger" aria-label={`Borrar la cuenta de ${p.name}`}>
                Borrar
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
