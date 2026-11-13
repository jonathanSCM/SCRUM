"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { AnimatePresence, motion } from "motion/react";
import CommandPalette from "./CommandPalette";
import ThemeToggle from "./ThemeToggle";
import NotificationBell from "./NotificationBell";
import TeamSwitcher, { type TeamOption } from "./TeamSwitcher";
import Avatar from "@/components/ui/Avatar";
import GlobalCreate, { OPEN_CREATE_EVENT } from "@/components/GlobalCreate";
import { PlusIcon } from "@/components/ui/Icons";

const LINKS = [
  { href: "/home", label: "Inicio" },
  { href: "/projects", label: "Proyectos" },
  { href: "/groups", label: "Grupos" },
  { href: "/my-work", label: "Mi trabajo" },
  { href: "/daily", label: "Daily" },
  { href: "/chat", label: "Chat" },
  { href: "/calendar", label: "Calendario" },
  { href: "/library", label: "Biblioteca" },
  { href: "/people", label: "Equipo" },
];

export default function Navbar({ userName, userId, isLead, teams, activeId, canCreate, maxOwned, projects }: { userName: string; userId: string; isLead: boolean; teams: TeamOption[]; activeId: string; canCreate: boolean; maxOwned: number; projects: Array<{ id: string; name: string; key: string | null; kind?: string }> }) {
  const pathname = usePathname();
  const isOwner = teams.find((t) => t.id === activeId)?.role === "OWNER";
  const links = isOwner ? [...LINKS, { href: "/activity", label: "Actividad" }] : LINKS; // la actividad del equipo la ve solo el dueño
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

  // Dentro de un grupo de tareas (/projects/<id>/…) se marca "Grupos", no "Proyectos".
  const onGroupPage = projects.some((p) => p.kind === "GROUP" && pathname?.startsWith(`/projects/${p.id}`));
  function isActive(href: string) {
    if (href === "/projects" && onGroupPage) return false;
    if (href === "/groups" && onGroupPage) return true;
    return pathname === href || pathname?.startsWith(`${href}/`);
  }

  function linkClass(href: string) {
    return `relative whitespace-nowrap py-1 text-sm transition-colors ${
      isActive(href) ? "font-semibold text-moss-ink" : "text-ink-soft hover:text-ink"
    }`;
  }

  const underline = (href: string) =>
    isActive(href) ? <motion.span layoutId="nav-underline" className="absolute inset-x-0 -bottom-[7px] h-[3px] bg-moss" transition={{ type: "spring", stiffness: 500, damping: 36 }} /> : null;

  return (
    <>
    <nav className="sticky top-0 z-40 border-b border-line bg-paper">
      <div className="mx-auto max-w-[1600px] px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-6 xl:gap-9">
            <Link href="/home" className="flex shrink-0 items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="SCRUM ProShop" className="h-8 w-8 border border-line object-cover rounded-md" />
              <span className="hidden font-display text-lg font-extrabold tracking-tight text-ink sm:inline lg:hidden 2xl:inline">SCRUM ProShop</span>
            </Link>
            <TeamSwitcher teams={teams} activeId={activeId} canCreate={canCreate} maxOwned={maxOwned} />
            <div className="hidden items-center gap-3 lg:flex xl:gap-5">
              {links.map((link) => (
                <Link key={link.href} href={link.href} className={linkClass(link.href)}>
                  {link.label}
                  {underline(link.href)}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_CREATE_EVENT))} className="btn-primary btn-sm hidden lg:inline-flex" title="Crear un ticket en cualquier proyecto" aria-label="Crear un ticket">
              <PlusIcon size={14} /> <span className="hidden xl:inline">Crear</span>
            </button>
            <CommandPalette />
            <NotificationBell />
            <ThemeToggle />
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Menú de usuario" className="flex items-center gap-2">
                <Avatar name={userName} userId={userId} size={32} />
              </button>
              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    role="menu"
                    className="absolute right-0 top-full z-50 mt-3 w-52 border border-line bg-card rounded-lg"
                    initial={{ opacity: 0, y: -6, boxShadow: "0 0 0 rgba(27, 23, 48, 0)" }}
                    animate={{ opacity: 1, y: 0, boxShadow: "0 12px 32px rgba(27, 23, 48, 0.16)" }}
                    exit={{ opacity: 0, y: -6, transition: { duration: 0.1 } }}
                    transition={{ type: "spring", stiffness: 500, damping: 32 }}
                  >
                    <p className="truncate border-b border-line-strong px-3 py-2 text-xs font-bold text-ink-faint">{userName}</p>
                    <Link href={`/people/${userId}`} onClick={() => setMenuOpen(false)} className="block px-3 py-2 text-sm text-ink hover:bg-card-2" role="menuitem">
                      Mi perfil
                    </Link>
                    <Link href="/settings" onClick={() => setMenuOpen(false)} className="block px-3 py-2 text-sm text-ink hover:bg-card-2" role="menuitem">
                      Ajustes
                    </Link>
                    {isLead && (
                      <Link href="/settings/integrations" onClick={() => setMenuOpen(false)} className="block px-3 py-2 text-sm text-ink hover:bg-card-2" role="menuitem">
                        Integraciones
                      </Link>
                    )}
                    {isLead && (
                      <Link href="/settings/statuses" onClick={() => setMenuOpen(false)} className="block px-3 py-2 text-sm text-ink hover:bg-card-2" role="menuitem">
                        Estados de proyecto
                      </Link>
                    )}
                    <button onClick={() => signOut({ callbackUrl: "/login" })} className="block w-full border-t border-line-strong px-3 py-2 text-left text-sm text-danger hover:bg-card-2" role="menuitem">
                      Salir
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-5 overflow-x-auto lg:hidden">
          <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_CREATE_EVENT))} className="btn-primary btn-sm shrink-0" aria-label="Crear un ticket">
            <PlusIcon size={14} /> Crear
          </button>
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={linkClass(link.href)}>
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
    <GlobalCreate projects={projects} currentUserId={userId} />
    </>
  );
}
