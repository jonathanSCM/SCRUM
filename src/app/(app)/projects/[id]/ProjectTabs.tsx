"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";

const TABS = [
  { slug: "board", label: "Tablero" },
  { slug: "backlog", label: "Backlog" },
  { slug: "epics", label: "Épicas" },
  { slug: "ceremonies", label: "Ceremonias" },
  { slug: "notes", label: "Notas" },
  { slug: "files", label: "Archivos" },
  { slug: "chat", label: "Chat" },
  { slug: "reports", label: "Reportes" },
  { slug: "activity", label: "Actividad" },
  { slug: "settings", label: "Ajustes" },
];

export default function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  return (
    <nav className="-mx-4 overflow-x-auto border-b border-line-strong px-4 sm:mx-0 sm:px-0" aria-label="Secciones del proyecto">
      <ul className="flex min-w-max gap-6">
        {TABS.map((t) => {
          const href = `/projects/${projectId}/${t.slug}`;
          const active = pathname === href || pathname?.startsWith(`${href}/`);
          return (
            <li key={t.slug} className="relative">
              <Link href={href} className={`block whitespace-nowrap pb-2.5 text-sm font-semibold transition-colors ${active ? "text-ink" : "text-ink-faint hover:text-ink-soft"}`}>
                {t.label}
              </Link>
              {active && <motion.span layoutId="project-tab" className="absolute inset-x-0 -bottom-px h-[2px] bg-rust" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
