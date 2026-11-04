"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/ui/Toaster";

export default function ProfileForm({ name: initialName, discordUserId: initialDiscord, telegramUsername: initialTelegram, slackUserId: initialSlack }: { name: string; discordUserId: string; telegramUsername: string; slackUserId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(initialName);
  const [discord, setDiscord] = useState(initialDiscord);
  const [slack, setSlack] = useState(initialSlack);
  const [telegram, setTelegram] = useState(initialTelegram);
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changing, setChanging] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await api("/api/users/me", "PATCH", { name, discordUserId: discord.trim(), telegramUsername: telegram.trim(), slackUserId: slack.trim() });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Perfil guardado");
    router.refresh();
  }

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
    <div className="space-y-8">
      <form onSubmit={save} className="space-y-4 border-2 border-ink bg-card p-5">
        <h2 className="font-display text-lg font-extrabold text-ink">Datos</h2>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Nombre</label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">ID de usuario de Discord</label>
          <input className="field font-mono" inputMode="numeric" placeholder="123456789012345678" value={discord} onChange={(e) => setDiscord(e.target.value)} />
          <p className="mt-1 text-xs text-ink-faint">
            Para que el bot te mencione. En Discord: Ajustes → Avanzado → activar Modo desarrollador; después clic derecho en tu usuario → Copiar ID.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Usuario de Telegram</label>
          <input className="field font-mono" placeholder="@tu_usuario" value={telegram} onChange={(e) => setTelegram(e.target.value)} maxLength={33} />
          <p className="mt-1 text-xs text-ink-faint">Para que el bot te mencione en el grupo. Es el nombre que aparece en Telegram → Ajustes → Nombre de usuario.</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">ID de miembro de Slack</label>
          <input className="field font-mono" placeholder="U01ABCDE2F3" value={slack} onChange={(e) => setSlack(e.target.value)} maxLength={20} />
          <p className="mt-1 text-xs text-ink-faint">Para que el bot te mencione. En Slack: tu perfil → ⋯ → Copiar ID de miembro.</p>
        </div>
        <div className="flex justify-end">
          <button className="btn-primary" disabled={saving || !name.trim()}>{saving ? "Guardando…" : "Guardar"}</button>
        </div>
      </form>

      <form onSubmit={changePassword} className="space-y-4 border-2 border-ink bg-card p-5">
        <h2 className="font-display text-lg font-extrabold text-ink">Cambiar contraseña</h2>
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
    </div>
  );
}
