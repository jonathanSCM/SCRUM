"use client";

import { useEffect, useRef } from "react";
import { animate, motion, useReducedMotion } from "motion/react";

// Número que "cuenta" hasta su valor al aparecer (KPIs).
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduced) {
      node.textContent = String(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        node.textContent = String(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [value, reduced]);

  return (
    <span ref={ref} className={className}>
      {value}
    </span>
  );
}

// Barra de progreso que se llena al aparecer.
export function ProgressBar({
  value,
  color = "var(--moss)",
  height = 14,
  striped = false,
  className = "",
}: {
  value: number;
  color?: string;
  height?: number;
  striped?: boolean;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={`overflow-hidden border-2 border-line bg-paper-deep ${className}`} style={{ height }} role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
      <motion.div
        className={`h-full ${striped ? "stripes" : ""}`}
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${clamped}%` }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}

// Lista cuyos hijos entran en cascada.
export const staggerParent = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045 } },
};
export const staggerChild = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 380, damping: 30 } },
};
