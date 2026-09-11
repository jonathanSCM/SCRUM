"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const LINKS = [
  { href: "/dashboard", label: "Proyectos" },
  { href: "/sprints", label: "Sprints" },
];

export default function Navbar({ userName, isLead }: { userName: string; isLead: boolean }) {
  const pathname = usePathname();
  const links = isLead ? [...LINKS, { href: "/settings/team", label: "Equipo" }] : LINKS;

  return (
    <nav className="sticky top-0 z-20 border-b border-line bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-9">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="SCRUM ProShop" className="h-8 w-8 rounded-lg object-cover" />
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
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-card text-xs font-semibold text-ink-soft">
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
