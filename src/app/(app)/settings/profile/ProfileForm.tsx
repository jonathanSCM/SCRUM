"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/ui/Toaster";
import { CHAT_COLORS } from "@/lib/scrum/chat";
import Avatar from "@/components/ui/Avatar";
import { COUNTRIES, defaultZoneOf, findCountry, formatDay, formatTime, offsetLabel } from "@/lib/scrum/countries";
import ProfileImages from "@/components/ProfileImages";

export default function ProfileForm({ name: initialName, discordUserId: initialDiscord, telegramUsername: initialTelegram, slackUserId: initialSlack, chatColor: initialColor, userId, tagline: initialTagline, country: initialCountry, timezone: initialTz, hasAvatar, hasBanner }: { country: string; timezone: string; name: string; discordUserId: string; telegramUsername: string; slackUserId: string; chatColor: string; userId: string; tagline: string; hasAvatar: boolean; hasBanner: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(initialName);
  const [discord, setDiscord] = useState(initialDiscord);
  const [tagline, setTagline] = useState(initialTagline);
  const [chatColor, setChatColor] = useState(initialColor);
  const [slack, setSlack] = useState(initialSlack);
  const [telegram, setTelegram] = useState(initialTelegram);
  const [saving, setSaving] = useState(false);
  const [country, setCountry] = useState(initialCountry);
  const [timezone, setTimezone] = useState(initialTz);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const countryData = findCountry(country);


  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await api("/api/users/me", "PATCH", { name, discordUserId: discord.trim(), telegramUsername: telegram.trim(), slackUserId: slack.trim(), chatColor, tagline: tagline.trim(), ...(country ? { country, timezone: timezone || defaultZoneOf(country) } : {}) });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Perfil guardado");
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <form onSubmit={save} className="space-y-4 border border-line bg-card p-5 rounded-lg">
        <h2 className="font-display text-lg font-extrabold text-ink">Datos</h2>
        <ProfileImages userId={userId} name={name} chatColor={chatColor} hasAvatar={hasAvatar} hasBanner={hasBanner} />
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Nombre</label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Frase de tu perfil</label>
          <input className="field" placeholder="Ej: Desarrollo frontend y diseño" maxLength={120} value={tagline} onChange={(e) => setTagline(e.target.value)} />
          <p className="mt-1 text-xs text-ink-faint">Se ve en tu perfil público, junto a tu nombre.</p>
        </div>
        <div className="space-y-2 rounded-lg border border-line bg-card-2/40 p-3">
          <label className="block text-xs font-semibold text-ink-soft" htmlFor="perfil-pais">País o región</label>
          <div className="grid gap-2 sm:grid-cols-2">
            <select id="perfil-pais" className="field" value={country} onChange={(e) => { setCountry(e.target.value); setTimezone(defaultZoneOf(e.target.value)); }}>
              <option value="">Elige tu país…</option>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
            {countryData && countryData.zones.length > 1 && (
              <select className="field" aria-label="Zona horaria" value={timezone || countryData.zones[0].tz} onChange={(e) => setTimezone(e.target.value)}>
                {countryData.zones.map((z) => <option key={z.tz} value={z.tz}>{z.label}</option>)}
              </select>
            )}
          </div>
          {country ? (
            <p className="text-xs text-ink-soft">Ahora son <b className="text-ink">{formatTime(now, timezone || defaultZoneOf(country))}</b> ({formatDay(now, timezone || defaultZoneOf(country), { weekday: "short", day: "numeric", month: "short" })}, {offsetLabel(now, timezone || defaultZoneOf(country))}). Las reuniones del calendario se te mostrarán en esta hora.</p>
          ) : (
            <p className="text-xs text-ink-faint">Sirve para que las reuniones se vean en tu hora: Perú y Bolivia, por ejemplo, tienen 1 hora de diferencia.</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Mi color en el chat</label>
          <div className="flex flex-wrap items-center gap-2">
            <Avatar name={name || "?"} size={32} color={chatColor || null} />
            {CHAT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={chatColor === c}
                onClick={() => setChatColor(c)}
                className={`h-7 w-7 rounded-full border-2 ${chatColor === c ? "border-ink" : "border-transparent"}`}
                style={{ background: c }}
              />
            ))}
            <input type="color" aria-label="Otro color" className="h-7 w-9 cursor-pointer rounded-md border border-line bg-paper p-0" value={chatColor || "#6d28d9"} onChange={(e) => setChatColor(e.target.value)} />
            {chatColor && (
              <button type="button" className="text-xs text-ink-faint hover:text-ink" onClick={() => setChatColor("")}>Quitar</button>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-faint">Tu nombre, tu avatar y el borde de tus mensajes usan este color.</p>
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

    </div>
  );
}
