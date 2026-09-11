"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type ConfirmFn = (message: string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm debe usarse dentro de ConfirmDialogProvider");
  return ctx;
}

export default function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((msg) => {
    setMessage(msg);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function respond(value: boolean) {
    setMessage(null);
    resolver.current?.(value);
    resolver.current = null;
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {message && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40" onClick={() => respond(false)}>
          <div
            className="w-full max-w-sm border border-line bg-card p-5 shadow-[4px_4px_0_var(--line-strong)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-lg font-semibold text-ink">Confirmar</h2>
            <p className="mt-2 text-sm text-ink-soft">{message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => respond(false)} className="btn-ghost">
                Cancelar
              </button>
              <button onClick={() => respond(true)} className="btn-primary">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
