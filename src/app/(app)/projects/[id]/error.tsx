"use client";

// Si una pestaña del proyecto falla, se muestra el motivo y se puede reintentar (en vez de quedarse "muerta").
export default function ProjectTabError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-lg border border-danger bg-danger-bg p-5 text-sm">
      <p className="font-semibold text-ink">No se pudo abrir esta sección.</p>
      <p className="mt-1 text-ink-soft">Intenta de nuevo. Si sigue igual, avisa con este código: <span className="font-mono">{error.digest ?? "sin código"}</span></p>
      <button className="btn-primary mt-3" onClick={reset}>Reintentar</button>
    </div>
  );
}
