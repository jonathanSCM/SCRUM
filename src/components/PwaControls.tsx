"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

      <BadgeCheck installed={p.installed} permission={p.permission} isIos={isIos} />

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

const SNOOZE_KEY = "push-snooze-until";
const snoozeFor = (days: number) => {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + days * 86_400_000));
  } catch {}
};

// Pide el permiso de notificaciones al entrar, en cualquier pantalla (no solo en Inicio).
// Los navegadores (sobre todo iPhone) solo muestran su diálogo tras un toque de la persona, así que:
//  - en la app instalada, el primer toque en cualquier parte ya abre el diálogo del sistema;
//  - en el navegador, aparece un aviso abajo con un botón (un toque) y "Ahora no" lo calla unos días;
//  - si el permiso ya estaba dado pero este dispositivo no quedó suscrito, se suscribe solo.
export function PushAutoPrompt() {
  const p = usePwa();
  const [snoozed, setSnoozed] = useState(true);
  const isIos = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    try {
      setSnoozed(Date.now() < Number(localStorage.getItem(SNOOZE_KEY) || 0));
    } catch {
      setSnoozed(false);
    }
  }, []);

  const canAsk = p.serverEnabled && p.supported && p.permission === "default" && !p.subscribed;
  const { enable } = p;

  // Permiso ya concedido pero sin suscripción en este dispositivo: se suscribe sin molestar.
  const healed = useRef(false);
  useEffect(() => {
    if (p.serverEnabled && p.supported && p.permission === "granted" && !p.subscribed && !healed.current) {
      healed.current = true;
      void enable();
    }
  }, [p.serverEnabled, p.supported, p.permission, p.subscribed, enable]);

  // App instalada: el primer toque en cualquier parte abre el diálogo del sistema.
  useEffect(() => {
    if (!canAsk || snoozed || !p.installed) return;
    const onTap = (e: Event) => {
      if ((e.target as HTMLElement | null)?.closest?.("[data-push-banner]")) return;
      document.removeEventListener("pointerup", onTap, true);
      void enable();
    };
    document.addEventListener("pointerup", onTap, true);
    return () => document.removeEventListener("pointerup", onTap, true);
  }, [canAsk, snoozed, p.installed, enable]);

  // iPhone en Safari (sin instalar): las notificaciones y la bolita solo existen en la app instalada.
  const iosNeedsInstall = isIos && !p.supported && !p.installed;
  if (snoozed || !(canAsk || iosNeedsInstall)) return null;

  return (
    <div data-push-banner className="fixed inset-x-3 bottom-3 z-50 rounded-xl border border-line-strong bg-card p-4 shadow-hard sm:inset-x-auto sm:right-4 sm:w-96">
      <p className="text-sm font-semibold text-ink">{iosNeedsInstall ? "Instala la app para recibir avisos" : "Recibe avisos en este dispositivo"}</p>
      <p className="mt-1 text-xs text-ink-soft">
        {iosNeedsInstall
          ? "En iPhone, los avisos y la bolita con el número solo funcionan con la app instalada: toca Compartir → “Añadir a pantalla de inicio” y ábrela desde el icono."
          : "Te avisamos cuando te asignan un ticket, te escriben o te mencionan, y el icono de la app muestra cuántos avisos tienes."}
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button className="btn-ghost btn-sm" onClick={() => { snoozeFor(iosNeedsInstall ? 7 : 3); setSnoozed(true); }}>{iosNeedsInstall ? "Entendido" : "Ahora no"}</button>
        {!iosNeedsInstall && (
          <button className="btn-primary btn-sm" disabled={p.busy} onClick={() => void enable()}>Activar avisos</button>
        )}
      </div>
    </div>
  );
}

// Diagnóstico de la "bolita" (número de avisos sin leer sobre el icono de la app). En iPhone solo funciona con la app
// instalada en la pantalla de inicio y con las notificaciones permitidas desde esa app; esta tarjeta dice qué falta.
function BadgeCheck({ installed, permission, isIos }: { installed: boolean; permission: NotificationPermission; isIos: boolean }) {
  const toast = useToast();
  const [api_, setApi] = useState(false);
  useEffect(() => setApi(typeof navigator !== "undefined" && "setAppBadge" in navigator), []);
  const rows: Array<[boolean, string]> = [
    [installed, isIos ? "App instalada en la pantalla de inicio (Compartir → Añadir a pantalla de inicio)" : "App instalada como aplicación"],
    [permission === "granted", "Notificaciones permitidas (se piden desde la app instalada)"],
    [api_, isIos ? "Este iPhone admite la bolita (iOS 16.4 o más reciente)" : "Este navegador admite la bolita"],
  ];
  async function test() {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    try {
      await nav.setAppBadge?.(7);
      toast.success("Puse un 7 en el icono por unos segundos: mira la pantalla de inicio.");
      window.setTimeout(() => void nav.clearAppBadge?.().catch(() => {}), 8000);
    } catch {
      toast.error("El sistema no dejó poner la bolita. Revisa los puntos de arriba.");
    }
  }
  return (
    <div className="space-y-1.5 border-t border-line-strong pt-4">
      <p className="text-sm font-semibold text-ink">Bolita con el número de avisos</p>
      <ul className="space-y-1 text-xs">
        {rows.map(([ok, label]) => (
          <li key={label} className={ok ? "text-moss-ink" : "text-ink-soft"}>
            <span aria-hidden="true">{ok ? "✓" : "✗"}</span> {label}
          </li>
        ))}
      </ul>
      {rows.every(([ok]) => ok) ? (
        <button className="btn-ghost btn-sm" onClick={test}>Probar la bolita</button>
      ) : (
        <p className="text-xs text-ink-faint">Cuando los tres puntos estén en ✓, el número aparece solo en el icono cada vez que llegue un aviso.</p>
      )}
    </div>
  );
}
