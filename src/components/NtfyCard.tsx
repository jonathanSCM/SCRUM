"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api } from "@/lib/client";
import { timeAgo } from "@/lib/ui";
import { useToast } from "@/components/ui/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";

type Channel = { enabled: boolean; minimal: boolean; topic: string; server: string; appLink: string; webLink: string; lastOkAt: string | null; lastError: string | null; disabledByErrors: boolean };

// Avisos en el teléfono con la app ntfy (Android / iOS): funcionan aunque el navegador bloquee las notificaciones.
export default function NtfyCard() {
  const toast = useToast();
  const confirm = useConfirm();
  const [configured, setConfigured] = useState(true);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  async function load() {
    const res = await api<{ configured: boolean; channel: Channel | null }>("/api/ntfy");
    if (res.ok) {
      setConfigured(res.data.configured);
      setChannel(res.data.channel);
    }
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!channel) return setQr(null);
    QRCode.toString(channel.appLink, { type: "svg", margin: 1, width: 168 }).then(setQr).catch(() => setQr(null));
  }, [channel?.appLink]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run<T>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, done?: string) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    if (done) toast.success(done);
    await load();
  }

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copiado`);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  if (loading) return <div className="skeleton h-10 w-full" />;
  if (!configured) return <p className="text-sm text-ink-faint">Los avisos al teléfono todavía no están disponibles en este servidor.</p>;

  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-display text-sm font-bold text-ink">Avisos en el teléfono (ntfy)</h3>
        <p className="text-xs text-ink-soft">Recibe menciones, avisos del equipo y de tus tickets en la app ntfy (Android e iOS). No depende del navegador: sirve también si tu navegador bloquea las notificaciones, como Brave.</p>
      </div>

      {!channel ? (
        <button className="btn-primary btn-sm" disabled={busy} onClick={() => run(() => api("/api/ntfy", "POST"), "Avisos al teléfono activados")}>Activar avisos en el teléfono</button>
      ) : (
        <div className="space-y-3">
          {channel.disabledByErrors && <p className="rounded-md border border-danger bg-danger-bg p-2 text-xs text-ink">Se desactivaron solos por errores seguidos ({channel.lastError}). Revisa la suscripción y vuelve a activarlos.</p>}
          <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-soft">
            <li>Instala la app <b>ntfy</b> (Google Play, F-Droid o App Store).</li>
            <li>
              Suscríbete a tu tema: en el teléfono pulsa{" "}
              <a href={channel.appLink} className="font-semibold text-rust hover:underline">Abrir en ntfy</a>, o escanea este código, o en la app pulsa «+», elige «usar otro servidor» y pon el servidor y el tema:
              <div className="mt-2 flex flex-wrap items-center gap-4">
                {qr && <div className="h-[168px] w-[168px] rounded-md border border-line bg-white p-1" dangerouslySetInnerHTML={{ __html: qr }} />}
                <div className="min-w-0 space-y-1 text-xs">
                  <p>Servidor: <span className="font-mono text-ink">{channel.server}</span></p>
                  <p className="break-all">Tema: <span className="font-mono text-ink">{channel.topic}</span></p>
                  <button className="btn-ghost btn-sm" onClick={() => copy(channel.topic, "Tema")}>Copiar tema</button>
                </div>
              </div>
            </li>
            <li>Pulsa «Enviar prueba» para comprobar que llega.</li>
          </ol>
          <p className="text-xs text-ink-faint">El tema es secreto: quien lo sepa puede leer tus avisos. No lo compartas; si dudas, usa «Cambiar tema».</p>

          <label className="flex items-start gap-2 text-sm text-ink-soft">
            <input type="checkbox" className="mt-1" checked={channel.minimal} onChange={(e) => run(() => api("/api/ntfy", "PATCH", { minimal: e.target.checked }))} />
            <span>Contenido mínimo <span className="text-ink-faint">(el aviso dice quién y dónde, pero no incluye el texto del mensaje)</span></span>
          </label>

          <div className="flex flex-wrap gap-2">
            <button className="btn-primary btn-sm" disabled={busy} onClick={() => run(() => api("/api/ntfy/test", "POST"), "Aviso de prueba enviado")}>Enviar prueba</button>
            {!channel.enabled && <button className="btn-ghost btn-sm" disabled={busy} onClick={() => run(() => api("/api/ntfy", "PATCH", { enabled: true }), "Avisos activados")}>Volver a activar</button>}
            {channel.enabled && <button className="btn-ghost btn-sm" disabled={busy} onClick={() => run(() => api("/api/ntfy", "PATCH", { enabled: false }), "Avisos pausados")}>Pausar</button>}
            <button
              className="btn-ghost btn-sm"
              disabled={busy}
              onClick={async () => {
                if (await confirm("Cambiar el tema deja de avisar a los teléfonos suscritos al actual: tendrás que volver a suscribirte. ¿Seguimos?", { confirmLabel: "Cambiar tema" })) await run(() => api("/api/ntfy/regenerate", "POST"), "Tema nuevo: vuelve a suscribir tu teléfono");
              }}
            >
              Cambiar tema
            </button>
            <button
              className="btn-ghost btn-sm text-danger"
              disabled={busy}
              onClick={async () => {
                if (await confirm("¿Quitar los avisos al teléfono? Se borra tu tema.", { confirmLabel: "Quitar", danger: true })) await run(() => api("/api/ntfy", "DELETE"), "Avisos al teléfono quitados");
              }}
            >
              Quitar
            </button>
          </div>
          {channel.lastOkAt && <p className="text-xs text-ink-faint">Último aviso enviado {timeAgo(channel.lastOkAt)}.</p>}
        </div>
      )}
    </section>
  );
}
