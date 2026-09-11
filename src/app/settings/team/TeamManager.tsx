"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmDialog";

type User = { id: string; name: string; email: string; role: string; createdAt: string };

export default function TeamManager({
  initialUsers,
  currentUserId,
}: {
  initialUsers: User[];
  currentUserId: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [users, setUsers] = useState(initialUsers);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"LEAD" | "MEMBER">("MEMBER");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createdPassword, setCreatedPassword] = useState<{ email: string; password: string } | null>(null);

  function randomPassword() {
    return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const password = randomPassword();
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "No se pudo crear la cuenta");
      return;
    }
    const created = await res.json();
    setUsers((prev) => [...prev, { ...created, createdAt: new Date().toISOString() }]);
    setCreatedPassword({ email, password });
    setName("");
    setEmail("");
    setRole("MEMBER");
    setShowForm(false);
    router.refresh();
  }

  async function removeUser(id: string, userName: string) {
    if (!(await confirm(`¿Borrar la cuenta de "${userName}"?`))) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "No se pudo borrar");
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== id));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {createdPassword && (
        <div className="border border-rust bg-card p-4 text-sm rounded-xl2 backdrop-blur-md">
          <p className="font-semibold text-ink">Cuenta creada — pasale estos datos, no se van a volver a mostrar:</p>
          <p className="mt-1 text-ink-soft">
            Email: <span className="font-mono">{createdPassword.email}</span>
          </p>
          <p className="text-ink-soft">
            Contraseña temporal: <span className="font-mono">{createdPassword.password}</span>
          </p>
          <button onClick={() => setCreatedPassword(null)} className="mt-2 text-xs text-ink-faint hover:text-ink">
            Cerrar
          </button>
        </div>
      )}

      {showForm ? (
        <form onSubmit={addUser} className="flex flex-wrap items-end gap-2 border border-line bg-card p-4 rounded-xl2 backdrop-blur-md">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Nombre</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className="field" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Email</label>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Rol</label>
            <select value={role} onChange={(e) => setRole(e.target.value as "LEAD" | "MEMBER")} className="field">
              <option value="MEMBER">Miembro</option>
              <option value="LEAD">Líder</option>
            </select>
          </div>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Creando..." : "Crear cuenta"}
          </button>
          <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">
            Cancelar
          </button>
        </form>
      ) : (
        <button onClick={() => setShowForm(true)} className="btn-ghost">
          + Nueva cuenta
        </button>
      )}

      {error && <p className="text-sm font-medium text-danger">{error}</p>}

      <ul className="space-y-2">
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between border border-line bg-card px-3.5 py-2.5 rounded-xl2 backdrop-blur-md">
            <div>
              <p className="text-sm text-ink">
                {u.name} {u.id === currentUserId && <span className="text-xs text-ink-faint">(vos)</span>}
              </p>
              <p className="text-xs text-ink-faint">
                {u.email} · {u.role === "LEAD" ? "Líder" : "Miembro"}
              </p>
            </div>
            {u.id !== currentUserId && (
              <button onClick={() => removeUser(u.id, u.name)} className="text-xs text-ink-faint hover:text-danger">
                Borrar
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
