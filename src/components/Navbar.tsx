"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import ThemeToggle from "./ThemeToggle";

const LINKS = [
  { href: "/dashboard", label: "Proyectos" },
  { href: "/sprints", label: "Sprints" },
];

export default function Navbar({ userName, isLead }: { userName: string; isLead: boolean }) {
  const pathname = usePathname();
  const links = isLead ? [...LINKS, { href: "/settings/team", label: "Equipo" }] : LINKS;

  return (
    <nav className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-9">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 rotate-3 items-center justify-center border border-ink bg-rust font-display text-sm font-semibold text-card">
              J
            </span>
            <span className="font-display text-lg font-semibold tracking-tight text-ink">Panel del Jefe</span>
          </Link>
          <div className="flex items-center gap-6">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm transition-colors ${
                  pathname?.startsWith(link.href) ? "font-semibold text-ink" : "text-ink-soft hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line-strong bg-card text-xs font-semibold text-ink-soft">
            {userName.slice(0, 2).toUpperCase()}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-ink-soft transition-colors hover:text-rust"
          >
            Salir
          </button>
        </div>
      </div>
    </nav>
  );
}
