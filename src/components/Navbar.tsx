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

  function linkClass(href: string) {
    return `whitespace-nowrap text-sm transition-colors ${
      pathname?.startsWith(href) ? "font-semibold text-moss" : "text-ink-soft hover:text-ink"
    }`;
  }

  return (
    <nav className="sticky top-0 z-20 border-b-2 border-line bg-paper">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-9">
            <Link href="/home" className="flex shrink-0 items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="SCRUM ProShop" className="h-8 w-8 border-2 border-line object-cover" />
              <span className="hidden font-display text-lg font-bold tracking-tight text-ink sm:inline">
                SCRUM ProShop
              </span>
            </Link>
            <div className="hidden items-center gap-6 sm:flex">
              {links.map((link) => (
                <Link key={link.href} href={link.href} className={linkClass(link.href)}>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <CommandPalette />
            <span className="flex h-8 w-8 items-center justify-center border-2 border-line bg-rust text-xs font-bold text-ink">
              {userName.slice(0, 2).toUpperCase()}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="whitespace-nowrap text-sm text-ink-soft transition-colors hover:text-danger"
            >
              Salir
            </button>
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
