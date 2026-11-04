"use client";

import { motion } from "motion/react";

// Transición de entrada entre pantallas (se vuelve a montar en cada navegación).
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}
