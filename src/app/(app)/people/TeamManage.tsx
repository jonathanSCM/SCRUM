"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/ui/Toaster";

type Invite = { id: string; email: string; role: "ADMIN" | "MEMBER"; expiresAt: string; expired: boolean; invitedBy: string | null };

// Invitaciones por email, nombre del equipo y salir del equipo.
export default function TeamManage({ workspaceName, isLead }: { workspaceName: string; isLead: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ email: string; url: string; emailed: boolean } | null>(null);
  const [name, setName] = useState(workspaceName);

  const load = useCallback(async () => {
    if (!isLead) return;
    const r = await fetch("/api/workspaces/invitations");
    if (r.ok) setInvites(await r.json());
  }, [isLead]);
  useEffect(() => { load(); }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await fetch("/api/workspaces/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role }) });
    const body = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return toast.error(body.error || "No se pudo invitar");
    setLink({ email: body.email, url: body.url, emailed: body.emailed });
    setEmail("");
    load();
  }

  async function resend(i: Invite) {
    const r = await fetch(`/api/workspaces/invitations/${i.id}/resend`, { method: "POST" });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(body.error || "No se pudo reenviar");
    if (body.url) setLink({ email: i.email, url: body.url, emailed: !!body.emailed });
    load();
  }

  async function revoke(i: Invite) {
    if (!(await confirm(`¿Cancelar la invitación a ${i.email}?`, { confirmLabel: "Cancelar invitación", danger: true }))) return;
    const r = await fetch(`/api/workspaces/invitations/${i.id}`, { method: "DELETE" });
    if (!r.ok) return toast.error("No se pudo cancelar");
    load();
  }

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/workspaces/current", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    if (!r.ok) return toast.error((await r.json().catch(() => ({}))).error || "No se pudo renombrar");
    toast.success("Nombre actualizado");
    router.refresh();
  }

  async function leave() {
    if (!(await confirm(`¿Salir de ${workspaceName}? Tus tickets asignados quedarán sin asignar.`, { confirmLabel: "Salir", danger: true }))) return;
    const r = await fetch("/api/workspaces/leave", { method: "POST" });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(body.error || "No se pudo salir");
    window.location.assign("/home");
  }

  return (
    <div className="space-y-3">
      {isLead && (
        <>
          <form onSubmit={invite} className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-card p-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink-soft">Invitar por email</label>
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field" placeholder="persona@correo.com" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink-soft">Rol</label>
              <select value={role} onChange={(e) => setRole(e.target.value as "ADMIN" | "MEMBER")} className="field">
                <option value="MEMBER">Miembro</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <button type="submit" disabled={busy} className="btn-primary">{busy ? "Enviando…" : "Invitar"}</button>
          </form>

          {link && (
            <div className="rounded-lg border border-rust bg-card p-4 text-sm">
              <p className="font-semibold text-ink">{link.emailed ? `Invitación enviada a ${link.email}.` : `Invitación creada para ${link.email} (el correo no está configurado: compártele el enlace).`}</p>
              <p className="mt-1 break-all font-mono text-xs text-ink-soft">{link.url}</p>
              <div className="mt-2 flex gap-3 text-xs">
                <button className="text-ink-soft hover:text-ink" onClick={() => navigator.clipboard?.writeText(link.url).then(() => toast.success("Enlace copiado"))}>Copiar enlace</button>
                <button className="text-ink-faint hover:text-ink" onClick={() => setLink(null)}>Cerrar</button>
              </div>
            </div>
          )}

          {invites.length > 0 && (
            <ul className="divide-y divide-line rounded-lg border border-line bg-card text-sm">
              {invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-ink">{i.email} <span className="text-xs text-ink-faint">· {i.role === "ADMIN" ? "Admin" : "Miembro"}{i.expired ? " · vencida" : ""}</span></span>
                  <button onClick={() => resend(i)} className="text-xs text-ink-soft hover:text-ink">Nuevo enlace</button>
                  <button onClick={() => revoke(i)} className="text-xs text-ink-faint hover:text-danger">Cancelar</button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={rename} className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink-soft">Nombre del equipo</label>
              <input required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className="field" />
            </div>
            <button type="submit" className="btn-ghost" disabled={name.trim() === workspaceName}>Renombrar</button>
          </form>
        </>
      )}
      <button onClick={leave} className="text-xs text-ink-faint hover:text-danger">Salir de este equipo</button>
    </div>
  );
}
