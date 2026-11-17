"use client";

import { useState } from "react";

const MEET_NEW = "https://meet.new"; // Google crea una reunión nueva y deja su enlace en la barra de direcciones
const MEET_LINK = /https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i;

// Campo del enlace de Meet con «Crear en Meet» (abre meet.new en otra pestaña) y «Pegar» (toma el enlace copiado).
// La aplicación no puede crear el enlace sola sin una cuenta de Google conectada; así son dos toques.
export default function MeetLinkField({ id, label = "Enlace de Meet (opcional)", value, onChange }: { id: string; label?: string; value: string; onChange: (v: string) => void }) {
  const [hint, setHint] = useState<string | null>(null);

  async function paste() {
    setHint(null);
    try {
      const text = await navigator.clipboard.readText();
      const found = text.match(MEET_LINK)?.[0];
      if (found) {
        onChange(found);
        setHint("Enlace pegado");
      } else if (/^https?:\/\//i.test(text.trim())) {
        onChange(text.trim().slice(0, 300));
      } else {
        setHint("No hay un enlace de Meet copiado todavía");
      }
    } catch {
      setHint("El navegador no dejó leer lo copiado: pega el enlace con Ctrl+V");
    }
  }

  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-ink-soft" htmlFor={id}>{label}</label>
      <div className="flex gap-2">
        <input id={id} className="field min-w-0 flex-1" maxLength={300} value={value} onChange={(e) => { setHint(null); onChange(e.target.value); }} placeholder="https://meet.google.com/…" />
        <a href={MEET_NEW} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm shrink-0 self-center" title="Abre Google Meet en otra pestaña y crea una reunión nueva: copia su enlace y vuelve aquí">Crear en Meet ↗</a>
        <button type="button" className="btn-ghost btn-sm shrink-0 self-center" onClick={paste} title="Pega el enlace de Meet que acabas de copiar">Pegar</button>
      </div>
      <p className="text-[11px] text-ink-faint">{hint ?? "«Crear en Meet» abre una reunión nueva: copia su enlace, vuelve y pulsa «Pegar»."}</p>
    </div>
  );
}
