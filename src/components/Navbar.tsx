"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { AnimatePresence, motion } from "motion/react";
import CommandPalette from "./CommandPalette";
import Avatar from "@/components/ui/Avatar";

const LINKS = [
  { href: "/home", label: "Inicio" },
  { href: "/projects", label: "Proyectos" },
  { href: "/my-work", label: "Mi trabajo" },
];

export default function Navbar({ userName, isLead }: { userName: string; isLead: boolean }) {
  const pathname = usePathname();
  const links = isLead ? [...LINKS, { href: "/settings/team", label: "Equipo" }] : LINKS;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function isActive(href: string) {
    return pathname === href || pathname?.startsWith(`${href}/`);
  }

  function linkClass(href: string) {
    return `relative whitespace-nowrap py-1 text-sm transition-colors ${
      isActive(href) ? "font-semibold text-moss" : "text-ink-soft hover:text-ink"
    }`;
  }

  const underline = (href: string) =>
    isActive(href) ? <motion.span layoutId="nav-underline" className="absolute inset-x-0 -bottom-[7px] h-[3px] bg-moss" transition={{ type: "spring", stiffness: 500, damping: 36 }} /> : null;

  return (
    <nav className="sticky top-0 z-40 border-b-2 border-line bg-paper">
      <div className="mx-auto max-w-[1600px] px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-9">
            <Link href="/home" className="flex shrink-0 items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="SCRUM ProShop" className="h-8 w-8 border-2 border-line object-cover" />
              <span className="hidden font-display text-lg font-extrabold tracking-tight text-ink sm:inline">SCRUM ProShop</span>
            </Link>
            <div className="hidden items-center gap-6 sm:flex">
              {links.map((link) => (
                <Link key={link.href} href={link.href} className={linkClass(link.href)}>
                  {link.label}
                  {underline(link.href)}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <CommandPalette />
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Menú de usuario" className="flex items-center gap-2">
                <Avatar name={userName} size={32} />
              </button>
              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    role="menu"
                    className="absolute right-0 top-full z-50 mt-3 w-52 border-2 border-ink bg-card"
                    initial={{ opacity: 0, y: -6, boxShadow: "0 0 0 var(--moss)" }}
                    animate={{ opacity: 1, y: 0, boxShadow: "5px 5px 0 var(--moss)" }}
                    exit={{ opacity: 0, y: -6, transition: { duration: 0.1 } }}
                    transition={{ type: "spring", stiffness: 500, damping: 32 }}
                  >
                    <p className="truncate border-b-2 border-line-strong px-3 py-2 text-xs font-bold text-ink-faint">{userName}</p>
                    <Link href="/settings/profile" onClick={() => setMenuOpen(false)} className="block px-3 py-2 text-sm text-ink hover:bg-card-2" role="menuitem">
                      Mi perfil
                    </Link>
                    {isLead && (
                      <Link href="/settings/statuses" onClick={() => setMenuOpen(false)} className="block px-3 py-2 text-sm text-ink hover:bg-card-2" role="menuitem">
                        Estados de proyecto
                      </Link>
                    )}
                    <button onClick={() => signOut({ callbackUrl: "/login" })} className="block w-full border-t-2 border-line-strong px-3 py-2 text-left text-sm text-danger hover:bg-card-2" role="menuitem">
                      Salir
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-5 overflow-x-auto sm:hidden">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={linkClass(link.href)}>
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
