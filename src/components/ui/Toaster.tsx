"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckIcon, XIcon } from "./Icons";

type Tone = "success" | "error" | "info";
type Toast = { id: number; message: string; tone: Tone };

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de ToastProvider");
  return ctx;
}

const TONE_STYLE: Record<Tone, { color: string; shadow: string }> = {
  success: { color: "var(--moss)", shadow: "var(--moss)" },
  error: { color: "var(--danger)", shadow: "var(--danger)" },
  info: { color: "var(--accent)", shadow: "var(--rust)" },
};

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (message: string, tone: Tone) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
      setTimeout(() => dismiss(id), tone === "error" ? 6000 : 3500);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push(m, "success"),
      error: (m) => push(m, "error"),
      info: (m) => push(m, "info"),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(92vw,22rem)] flex-col gap-3" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.15 } }}
              transition={{ type: "spring", stiffness: 520, damping: 34 }}
              className="pointer-events-auto flex items-start gap-3 border border-line bg-card p-3 text-sm rounded-lg"
              style={{ boxShadow: `5px 5px 0 ${TONE_STYLE[t.tone].shadow}` }}
              role={t.tone === "error" ? "alert" : "status"}
            >
              <span className="mt-0.5 shrink-0" style={{ color: TONE_STYLE[t.tone].color }}>
                {t.tone === "error" ? <XIcon size={16} /> : <CheckIcon size={16} />}
              </span>
              <p className="min-w-0 flex-1 text-ink">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="shrink-0 text-ink-faint hover:text-ink" aria-label="Cerrar aviso">
                <XIcon size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
