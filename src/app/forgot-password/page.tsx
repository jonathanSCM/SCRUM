"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = await res.json();
    setLoading(false);
    setMessage(body.message || body.error || "Listo.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5 surface-card p-9">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">¿Olvidaste tu contraseña?</h1>
          <p className="mt-1 text-sm text-ink-soft">Escribí tu email y te mandamos un link para restablecerla.</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
            placeholder="tu@empresa.com"
          />
        </div>

        {message && <p className="text-sm font-medium text-moss">{message}</p>}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Enviando..." : "Enviar link"}
        </button>

        <Link href="/login" className="block text-center text-xs text-ink-faint hover:text-ink">
          Volver a iniciar sesión
        </Link>
      </form>
    </div>
  );
}
