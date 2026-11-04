"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

type ConfirmOptions = { confirmLabel?: string; danger?: boolean };
type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm debe usarse dentro de ConfirmDialogProvider");
  return ctx;
}

export default function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ message: string; options: ConfirmOptions } | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((message, options = {}) => {
    setState({ message, options });
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function respond(value: boolean) {
    setState(null);
    resolver.current?.(value);
    resolver.current = null;
  }

  useEffect(() => {
    if (!state) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") respond(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AnimatePresence>
        {state && (
          <motion.div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0b0614]/70 px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            onClick={() => respond(false)}
          >
            <motion.div
              role="alertdialog"
              aria-modal="true"
              className="w-full max-w-sm border-2 border-ink bg-card p-5"
              initial={{ scale: 0.94, y: 12, boxShadow: "0 0 0 var(--danger)" }}
              animate={{ scale: 1, y: 0, boxShadow: `7px 7px 0 ${state.options.danger === false ? "var(--moss)" : "var(--danger)"}` }}
              exit={{ scale: 0.97, opacity: 0, transition: { duration: 0.1 } }}
              transition={{ type: "spring", stiffness: 480, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="font-display text-lg font-bold text-ink">Confirmar</h2>
              <p className="mt-2 text-sm text-ink-soft">{state.message}</p>
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => respond(false)} className="btn-ghost">
                  Cancelar
                </button>
                <button onClick={() => respond(true)} className={state.options.danger === false ? "btn-primary" : "btn-danger"} autoFocus>
                  {state.options.confirmLabel ?? "Confirmar"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}
