"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [available, setAvailable] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/bootstrap")
      .then((res) => res.json())
      .then((body) => setAvailable(!!body.available))
      .finally(() => setChecking(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/auth/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "No se pudo crear la cuenta");
      return;
    }
    router.push("/login");
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-ink-faint">Cargando...</p>
      </div>
    );
  }

  if (!available) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm surface-card p-9 text-center">
          <h1 className="font-display text-xl font-semibold text-ink">Ya hay un administrador</h1>
          <p className="mt-2 text-sm text-ink-soft">
            El registro inicial ya fue completado. Pedile una cuenta a un líder.
          </p>
          <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-rust hover:underline">
            Ir a iniciar sesión
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5 surface-card p-9">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="SCRUM ProShop" className="mb-3 h-10 w-10 border-2 border-line object-cover" />
          <h1 className="font-display text-2xl font-bold text-ink">Crear cuenta de administrador</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Este panel es nuevo, sin usuarios todavía. La primera cuenta que crees queda como líder.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Nombre</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className="field" />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Contraseña</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field"
            placeholder="Mínimo 8 caracteres"
          />
        </div>

        {error && <p className="text-sm font-medium text-danger">{error}</p>}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Creando..." : "Crear cuenta y empezar"}
        </button>
      </form>
    </div>
  );
}
