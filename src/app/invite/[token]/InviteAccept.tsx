"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn, signOut } from "next-auth/react";

type Info = { state: "ok" | "expired" | "used" | "revoked"; workspaceName: string; roleLabel: string; email: string; invitedBy: string | null; accountExists: boolean };

const STATE_MSG: Record<string, string> = {
  expired: "La invitación venció. Pide que te manden otra.",
  used: "Esta invitación ya se usó.",
  revoked: "Esta invitación fue cancelada.",
};

export default function InviteAccept({ token, sessionEmail }: { token: string; sessionEmail: string | null }) {
  const router = useRouter();
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/invite/${token}`)
      .then(async (r) => (r.ok ? setInfo(await r.json()) : setMissing(true)))
      .catch(() => setMissing(true));
  }, [token]);

  async function accept(e?: React.FormEvent) {
    e?.preventDefault();
    if (!info) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/invite/${token}/accept`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, password }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      return setError(body.error || "No se pudo aceptar la invitación");
    }
    // Cuenta recién creada: iniciar sesión con los datos que acaba de poner.
    if (!body.loggedIn) {
      const r = await signIn("credentials", { email: info.email, password, redirect: false });
      if (r?.error) {
        setBusy(false);
        return router.push("/login");
      }
    }
    router.push("/home");
    router.refresh();
  }

  const card = "w-full max-w-sm space-y-5 surface-card p-9";
  const wrap = (children: React.ReactNode) => <div className="flex min-h-screen items-center justify-center px-4"><div className={card}>{children}</div></div>;

  if (missing) return wrap(<><h1 className="font-display text-2xl font-bold text-ink">Invitación no encontrada</h1><p className="text-sm text-ink-soft">El enlace no es válido. Revisa que lo copiaste completo.</p></>);
  if (!info) return wrap(<p className="text-sm text-ink-soft">Cargando…</p>);
  if (info.state !== "ok") return wrap(<><h1 className="font-display text-2xl font-bold text-ink">Invitación no disponible</h1><p className="text-sm text-ink-soft">{STATE_MSG[info.state]}</p><Link href="/login" className="btn-primary block text-center">Ir a iniciar sesión</Link></>);

  const header = (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink">Únete a {info.workspaceName}</h1>
      <p className="mt-1 text-sm text-ink-soft">{info.invitedBy ? `${info.invitedBy} te invitó` : "Te invitaron"} como <strong>{info.roleLabel}</strong>.</p>
      <p className="mt-1 font-mono text-xs text-ink-faint">{info.email}</p>
    </div>
  );

  // Con sesión
  if (sessionEmail) {
    if (sessionEmail.trim().toLowerCase() !== info.email.trim().toLowerCase()) {
      return wrap(<>{header}<p className="text-sm font-medium text-danger">Iniciaste sesión como {sessionEmail}, pero la invitación es para {info.email}.</p><button className="btn-primary w-full" onClick={() => signOut({ callbackUrl: `/invite/${token}` })}>Cerrar sesión y continuar</button></>);
    }
    return wrap(<>{header}{error && <p className="text-sm font-medium text-danger">{error}</p>}<button className="btn-primary w-full" disabled={busy} onClick={() => accept()}>{busy ? "Uniéndome…" : "Unirme al equipo"}</button></>);
  }

  // Sin sesión y con cuenta: iniciar sesión primero
  if (info.accountExists) {
    return wrap(<>{header}<p className="text-sm text-ink-soft">Ya tienes una cuenta con este email. Inicia sesión para aceptar.</p><Link href={`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`} className="btn-primary block text-center">Iniciar sesión</Link></>);
  }

  // Sin cuenta: crearla
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={accept} className={card}>
        {header}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Tu nombre</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className="field" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Contraseña</label>
          <input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="field" placeholder="Mínimo 8 caracteres" />
        </div>
        {error && <p className="text-sm font-medium text-danger">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? "Creando cuenta…" : "Crear cuenta y unirme"}</button>
      </form>
    </div>
  );
}
