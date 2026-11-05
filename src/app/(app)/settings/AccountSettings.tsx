"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { useToast } from "@/components/ui/Toaster";
import { PwaCard } from "@/components/PwaControls";
import AiTokenCard from "@/components/AiTokenCard";

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border border-line bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
        <span>
          <span className="block font-display text-base font-extrabold text-ink">{title}</span>
          <span className="block text-xs text-ink-soft">{hint}</span>
        </span>
        <span className="text-ink-faint transition-transform group-open:rotate-90" aria-hidden>›</span>
      </summary>
      <div className="border-t border-line p-5">{children}</div>
    </details>
  );
}

export default function AccountSettings({ userName }: { userName: string }) {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changing, setChanging] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setChanging(true);
    const res = await api("/api/users/me/password", "POST", { currentPassword, newPassword });
    setChanging(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Contraseña actualizada");
    setCurrentPassword("");
    setNewPassword("");
  }

  return (
    <div className="space-y-3">
      <Section title="Notificaciones" hint="Avisos en este dispositivo y app instalable">
        <PwaCard />
      </Section>
      <Section title="Token de IA" hint="Para conectar un asistente externo a tu cuenta">
        <AiTokenCard userName={userName} />
      </Section>
      <Section title="Cambiar contraseña" hint="Actualiza tu contraseña de acceso">
        <form onSubmit={changePassword} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Contraseña actual</label>
            <input className="field" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Contraseña nueva (mínimo 8 caracteres)</label>
            <input className="field" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <button className="btn-primary" disabled={changing || !currentPassword || newPassword.length < 8}>{changing ? "Cambiando…" : "Cambiar contraseña"}</button>
          </div>
        </form>
      </Section>
    </div>
  );
}
