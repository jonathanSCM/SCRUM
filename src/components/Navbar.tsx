"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import CommandPalette from "./CommandPalette";

const LINKS = [
  { href: "/home", label: "Inicio" },
  { href: "/dashboard", label: "Proyectos" },
  { href: "/my-week", label: "Mi semana" },
  { href: "/sprints", label: "Sprints" },
];

export default function Navbar({ userName, isLead }: { userName: string; isLead: boolean }) {
  const pathname = usePathname();
  const links = isLead ? [...LINKS, { href: "/settings/team", label: "Equipo" }] : LINKS;

  return (
    <nav className="sticky top-0 z-20 border-b-2 border-line bg-paper">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-9">
          <Link href="/home" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="SCRUM ProShop" className="h-8 w-8 border-2 border-line object-cover" />
            <span className="font-display text-lg font-bold tracking-tight text-ink">SCRUM ProShop</span>
          </Link>
          <div className="flex items-center gap-6">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm transition-colors ${
                  pathname?.startsWith(link.href) ? "font-semibold text-moss" : "text-ink-soft hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <CommandPalette />
          <span className="flex h-8 w-8 items-center justify-center border-2 border-line bg-rust text-xs font-bold text-ink">
            {userName.slice(0, 2).toUpperCase()}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-ink-soft transition-colors hover:text-danger"
          >
            Salir
          </button>
        </div>
      </div>
    </nav>
  );
}
