"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { currentSubscription, isStandalone, pushSupported, registerServiceWorker, subscribeToPush, unsubscribeFromPush } from "@/lib/pwaClient";
import { useToast } from "@/components/ui/Toaster";

// Evento no estándar de Chrome/Edge/Android para instalar la app.
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferredPrompt: InstallPromptEvent | null = null;

// Registra el service worker (necesario para instalar y recibir push).
export function ServiceWorkerRegister() {
  useEffect(() => {
    void registerServiceWorker();
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e as InstallPromptEvent;
      window.dispatchEvent(new Event("pwa-install-available"));
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  return null;
}

function usePwa() {
  const toast = useToast();
  const [supported, setSupported] = useState(false);
  const [serverEnabled, setServerEnabled] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const ok = pushSupported();
    setSupported(ok);
    setInstalled(isStandalone());
    setCanInstall(!!deferredPrompt);
    if (ok) {
      setPermission(Notification.permission);
      setSubscribed(!!(await currentSubscription()));
    }
    const cfg = await api<{ enabled: boolean; publicKey: string | null }>("/api/push/config");
    if (cfg.ok) {
      setServerEnabled(cfg.data.enabled);
      setPublicKey(cfg.data.publicKey);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onAvail = () => setCanInstall(!!deferredPrompt);
    window.addEventListener("pwa-install-available", onAvail);
    return () => window.removeEventListener("pwa-install-available", onAvail);
  }, [refresh]);

  async function enable() {
    if (!publicKey) return toast.error("Las notificaciones no están configuradas en el servidor.");
    setBusy(true);
    const res = await subscribeToPush(publicKey);
    setBusy(false);
    await refresh();
    if (res.ok) toast.success("Notificaciones activadas en este dispositivo");
    else toast.error(res.error);
  }

  async function disable() {
    setBusy(true);
    await unsubscribeFromPush();
    setBusy(false);
    await refresh();
    toast.success("Notificaciones desactivadas en este dispositivo");
  }

  async function sendTest() {
    const res = await api("/api/push/test", "POST", {});
    if (!res.ok) toast.error(res.error);
    else toast.success("Notificación de prueba enviada");
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    setCanInstall(false);
    if (choice.outcome === "accepted") setInstalled(true);
  }

  return { supported, serverEnabled, permission, subscribed, canInstall, installed, busy, enable, disable, sendTest, install };
}

// Tarjeta de Mi perfil: instalar la app y activar las notificaciones.
export function PwaCard() {
  const p = usePwa();
  const isIos = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

  return (
    <section className="space-y-4 rounded-lg border border-line bg-card p-5">
      <h2 className="font-display text-lg font-extrabold text-ink">App y notificaciones</h2>

      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-ink">Instalar como app</p>
        {p.installed ? (
          <p className="text-xs text-ink-soft">Ya la estás usando como app instalada.</p>
        ) : p.canInstall ? (
          <button className="btn-primary btn-sm" onClick={p.install}>Instalar SCRUM ProShop</button>
        ) : (
          <p className="text-xs text-ink-faint">
            {isIos ? "En iPhone/iPad: botón Compartir → “Añadir a pantalla de inicio”." : "Si tu navegador la admite, aparece el icono de instalar en la barra de direcciones (o en el menú: “Instalar app”)."}
          </p>
        )}
      </div>

      <div className="space-y-1.5 border-t border-line-strong pt-4">
        <p className="text-sm font-semibold text-ink">Notificaciones en este dispositivo</p>
        {!p.serverEnabled ? (
          <p className="text-xs text-ink-faint">El servidor todavía no tiene activadas las notificaciones del navegador (faltan las claves VAPID).</p>
        ) : !p.supported ? (
          <p className="text-xs text-ink-faint">Este navegador no admite notificaciones push.{isIos ? " En iPhone hay que instalar la app en la pantalla de inicio primero." : ""}</p>
        ) : p.permission === "denied" ? (
          <p className="text-xs text-danger">Bloqueaste las notificaciones de este sitio. Habilitalas desde los ajustes del sitio en tu navegador.</p>
        ) : p.subscribed ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="lozenge text-moss-ink">Activadas</span>
            <button className="btn-ghost btn-sm" onClick={p.sendTest}>Enviar notificación de prueba</button>
            <button className="btn-ghost btn-sm" disabled={p.busy} onClick={p.disable}>Desactivar</button>
          </div>
        ) : (
          <>
            <p className="text-xs text-ink-soft">Te avisamos cuando te asignan un ticket, te comentan o empieza o termina un sprint, aunque tengas la app cerrada.</p>
            <button className="btn-primary btn-sm" disabled={p.busy} onClick={p.enable}>Activar notificaciones</button>
          </>
        )}
      </div>
    </section>
  );
}

// Aviso en Inicio que pide el permiso (el navegador exige un clic del usuario).
export function NotificationPrompt() {
  const p = usePwa();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem("push-prompt-dismissed") === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (dismissed || !p.serverEnabled || !p.supported || p.permission !== "default" || p.subscribed) return null;

  function dismiss() {
    try {
      localStorage.setItem("push-prompt-dismissed", "1");
    } catch {}
    setDismissed(true);
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card-2 px-4 py-3">
      <p className="min-w-0 flex-1 text-sm text-ink">¿Querés recibir avisos en este dispositivo cuando te asignen un ticket o te comenten?</p>
      <button className="btn-primary btn-sm" disabled={p.busy} onClick={p.enable}>Activar notificaciones</button>
      <button className="btn-ghost btn-sm" onClick={dismiss}>Ahora no</button>
    </div>
  );
}
