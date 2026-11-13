"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { useToast } from "@/components/ui/Toaster";

// El botón crea el token de la extensión y lo deja en la página (#mext-token-bridge) para que la extensión lo lea y lo guarde.
// Hace falta pulsarlo a propósito: abrir esta página no conecta nada.
export default function ExtensionConnect() {
  const toast = useToast();
  const [state, setState] = useState<{ token: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function connect() {
    setBusy(true);
    const res = await api<{ token: string; name: string }>("/api/extension/authorize", "POST");
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setState(res.data);
  }
  async function disconnect() {
    const res = await api("/api/extension/authorize", "DELETE");
    if (!res.ok) return toast.error(res.error);
    setState(null);
    toast.success("Extensión desconectada");
  }

  return (
    <div className="mt-6 space-y-5">
      {state ? (
        <div className="rounded-xl border border-moss bg-card p-5">
          <p className="font-display text-lg font-extrabold text-moss-ink">¡Listo, extensión conectada!</p>
          <p className="mt-1 text-sm text-ink-soft">Ya puedes cerrar esta pestaña y abrir una reunión de Google Meet. Si la extensión no muestra «Conectado», vuelve a pulsar el botón con la extensión instalada.</p>
          {/* La extensión lee este elemento y guarda el token en su almacenamiento. */}
          <div id="mext-token-bridge" data-token={state.token} data-name={state.name} hidden />
        </div>
      ) : (
        <div className="rounded-xl border border-line-strong bg-card p-5">
          <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-ink-soft">
            <li>La extensión <b className="text-ink">nunca graba sola</b>: solo cuando pulsas «Grabar esta reunión».</li>
            <li>Quien graba avisa a los participantes y cuenta con su consentimiento si la ley lo pide.</li>
            <li>El audio se transcribe y se borra; solo quedan el texto y los subtítulos.</li>
          </ul>
          <button className="btn-primary" disabled={busy} onClick={connect}>{busy ? "Conectando…" : "Conectar la extensión"}</button>
        </div>
      )}
      <section className="rounded-xl border border-line bg-card-2/40 p-5 text-sm text-ink-soft">
        <h2 className="font-display text-base font-extrabold text-ink">Instalar la extensión</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li><a href="/downloads/scrum-proshop-meet-extension.zip" className="font-semibold text-rust hover:underline">Descarga el .zip</a> y descomprímelo en una carpeta.</li>
          <li>En Chrome abre <span className="font-mono">chrome://extensions</span> y activa «Modo de desarrollador».</li>
          <li>Pulsa «Cargar descomprimida» y elige la carpeta.</li>
          <li>Vuelve aquí y pulsa «Conectar la extensión».</li>
        </ol>
      </section>
      <button className="text-xs text-ink-faint hover:text-danger" onClick={disconnect}>Desconectar la extensión de mi cuenta</button>
    </div>
  );
}
