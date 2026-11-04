"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { XIcon } from "./Icons";

// Modal con entrada tipo "sello": sube con un pequeño rebote y la sombra dura
// aparece al final. Se cierra con Esc o clickeando afuera.
export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-autofocus], input, textarea, select")?.focus());
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[#1b1730]/40 px-4 py-[8vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`w-full ${width} border border-line bg-card`}
            initial={{ opacity: 0, y: 24, scale: 0.96, boxShadow: "0px 0px 0 var(--moss)" }}
            animate={{ opacity: 1, y: 0, scale: 1, boxShadow: "8px 8px 0 var(--moss)" }}
            exit={{ opacity: 0, y: 12, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
              <button onClick={onClose} className="text-ink-faint hover:text-ink" aria-label="Cerrar">
                <XIcon size={18} />
              </button>
            </div>
            <div className="px-5 py-4">{children}</div>
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
